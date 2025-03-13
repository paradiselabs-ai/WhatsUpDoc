#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs/promises';
import * as path from 'path';
import TurndownService from 'turndown';

type CheerioRoot = ReturnType<typeof cheerio.load>;

interface FetchDocsArgs {
  url: string;
  selector?: string;
  outputPath?: string;
  recursive?: boolean;
  maxDepth?: number;
  splitByHeaders?: boolean;
}

interface PageSection {
  title: string;
  content: string;
  level: number;
}

class DevDocsServer {
  private server: Server;
  private baseOutputDir: string;
  private visitedUrls: Set<string> = new Set();
  private turndown: TurndownService;

  constructor() {
    this.server = new Server(
      {
        name: 'dev-docs-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {
            fetch_docs: {
              description: 'Fetch and save developer documentation from a URL',
              inputSchema: {
                type: 'object',
                properties: {
                  url: {
                    type: 'string',
                    description: 'URL of the documentation page',
                  },
                  selector: {
                    type: 'string',
                    description: 'Optional CSS selector to target specific content',
                  },
                  outputPath: {
                    type: 'string',
                    description: 'Optional custom output path',
                  },
                  recursive: {
                    type: 'boolean',
                    description: 'Whether to recursively fetch linked documentation pages',
                  },
                  maxDepth: {
                    type: 'number',
                    description: 'Maximum depth for recursive fetching',
                  },
                  splitByHeaders: {
                    type: 'boolean',
                    description: 'Whether to split documentation by headers into separate files',
                  },
                },
                required: ['url'],
              },
            },
          },
        },
      }
    );

    // Default output directory in user's home directory
    this.baseOutputDir = process.env.DOCS_OUTPUT_DIR || path.join(process.env.HOME || '', '.dev-docs');

    // Configure turndown
    this.turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      emDelimiter: '*',
      bulletListMarker: '-',
    });

    // Preserve code blocks
    this.turndown.addRule('codeBlocks', {
      filter: ['pre', 'code'],
      replacement: function(content: string, node: Node) {
        const element = node as HTMLElement;
        const className = element.className || '';
        const language = className.replace('language-', '') || '';
        return '\n```' + language + '\n' + content + '\n```\n';
      }
    });

    this.setupToolHandlers();
    
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'fetch_docs',
          description: 'Fetch and save developer documentation from a URL',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'URL of the documentation page',
              },
              selector: {
                type: 'string',
                description: 'Optional CSS selector to target specific content',
              },
              outputPath: {
                type: 'string',
                description: 'Optional custom output path',
              },
              recursive: {
                type: 'boolean',
                description: 'Whether to recursively fetch linked documentation pages',
              },
              maxDepth: {
                type: 'number',
                description: 'Maximum depth for recursive fetching',
              },
              splitByHeaders: {
                type: 'boolean',
                description: 'Whether to split documentation by headers into separate files',
              },
            },
            required: ['url'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name !== 'fetch_docs') {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${request.params.name}`
        );
      }

      const args = request.params.arguments as unknown;
      if (!this.isFetchDocsArgs(args)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Invalid arguments for fetch_docs tool'
        );
      }

      try {
        const urlObj = new URL(args.url);
        const baseUrl = `${urlObj.protocol}//${urlObj.hostname}`;
        let outputPath = args.outputPath;
        if (!outputPath) {
          const defaultOutputPath = urlObj.hostname + (args.splitByHeaders ? '' : urlObj.pathname.replace(/\//g, '_') + '.md');
          outputPath = path.join(this.baseOutputDir, defaultOutputPath);
        }

        // Create output directory
        await fs.mkdir(path.dirname(outputPath), { recursive: true });

        const savedFiles = await this.fetchAndSaveDoc(
          args.url,
          baseUrl,
          outputPath,
          args.selector,
          args.recursive || false,
          args.maxDepth || 3,
          args.splitByHeaders || false,
          0
        );

        return {
          content: [
            {
              type: 'text',
              text: `Documentation saved to: ${savedFiles.join('\n')}`,
            },
          ],
        };
      } catch (error) {
        if (axios.isAxiosError(error)) {
          return {
            content: [
              {
                type: 'text',
                text: `Failed to fetch documentation: ${
                  error.response?.data?.message || error.message
                }`,
              },
            ],
            isError: true,
          };
        }
        throw error;
      }
    });
  }

  private async fetchAndSaveDoc(
    url: string,
    baseUrl: string,
    outputPath: string,
    selector?: string,
    recursive: boolean = false,
    maxDepth: number = 3,
    splitByHeaders: boolean = false,
    currentDepth: number = 0
  ): Promise<string[]> {
    if (this.visitedUrls.has(url) || currentDepth > maxDepth) {
      return [];
    }

    this.visitedUrls.add(url);
    const savedFiles: string[] = [];

    try {
      const response = await axios.get(url);
      const $ = cheerio.load(response.data);
      
      // Extract content
      const mainContent = selector ? $(selector) : $('body');
      if (!mainContent.length) {
        throw new Error('No content found');
      }

      // Update relative URLs to absolute
      mainContent.find('a[href^="/"]').each((_, elem) => {
        const $elem = $(elem);
        const href = $elem.attr('href');
        if (href) {
          $elem.attr('href', new URL(href, baseUrl).toString());
        }
      });

      // Clean the content
      this.cleanHtml($, mainContent);

      if (splitByHeaders) {
        // Split content by headers
        const sections = this.splitByHeaders($, mainContent);
        const indexContent: string[] = [];
        
        for (const section of sections) {
          const sectionFileName = this.sanitizeFileName(section.title) + '.md';
          const sectionPath = path.join(path.dirname(outputPath), sectionFileName);
          
          await this.saveMarkdown(sectionPath, section.content);
          savedFiles.push(sectionPath);
          indexContent.push(`- [${section.title}](${sectionFileName})`);
        }

        // Create index file
        const indexPath = path.join(path.dirname(outputPath), 'README.md');
        await this.saveMarkdown(indexPath, `# Documentation Index\n\n${indexContent.join('\n')}`);
        savedFiles.push(indexPath);
      } else {
        // Save as single file
        const markdown = this.turndown.turndown(mainContent.html() || '');
        await this.saveMarkdown(outputPath, markdown);
        savedFiles.push(outputPath);
      }

      if (recursive) {
        // Find and process linked documentation pages
        const links = mainContent.find('a[href]').map((_, elem) => {
          const href = $(elem).attr('href');
          if (!href) return null;
          try {
            const linkUrl = new URL(href, baseUrl);
            // Only follow links to the same hostname and path that looks like documentation
            if (linkUrl.hostname === new URL(baseUrl).hostname &&
                /\/(docs|documentation|guide|tutorial|reference|manual|api)\//i.test(linkUrl.pathname)) {
              return linkUrl.toString();
            }
          } catch (e) {
            // Invalid URL
          }
          return null;
        }).get().filter((url): url is string => url !== null);

        // Recursively fetch linked pages
        for (const link of links) {
          const linkOutputPath = path.join(
            path.dirname(outputPath),
            this.sanitizeFileName(new URL(link).pathname) + '.md'
          );
          const nestedFiles = await this.fetchAndSaveDoc(
            link,
            baseUrl,
            linkOutputPath,
            selector,
            recursive,
            maxDepth,
            splitByHeaders,
            currentDepth + 1
          );
          savedFiles.push(...nestedFiles);
        }
      }

      return savedFiles;
    } catch (error) {
      console.error(`Failed to fetch ${url}:`, error);
      return savedFiles;
    }
  }

  private splitByHeaders($: CheerioRoot, mainContent: ReturnType<CheerioRoot>): PageSection[] {
    const sections: PageSection[] = [];

    // Find all headers
    mainContent.find('h1, h2, h3, h4, h5, h6').each((_, elem) => {
      const $elem = $(elem);
      const level = parseInt($elem.get(0).tagName[1]);
      const title = $elem.text().trim();
      
      // Get all content until the next header
      let content = '';
      let node = elem;
      while (node.next && !$(node.next).is('h1, h2, h3, h4, h5, h6')) {
        content += $(node.next).toString();
        node = node.next;
      }

      sections.push({
        title,
        content: this.turndown.turndown(`<h${level}>${title}</h${level}>${content}`),
        level,
      });
    });

    return sections;
  }

  private sanitizeFileName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private async saveMarkdown(filePath: string, content: string): Promise<void> {
    await fs.writeFile(filePath, content, 'utf8');
  }

  private cleanHtml($: CheerioRoot, mainContent: ReturnType<CheerioRoot>): void {
    // Remove script and style tags
    mainContent.find('script, style').remove();

    // Remove tracking pixels, ads, etc.
    mainContent.find('iframe, .ads, .tracking, .analytics').remove();

    // Clean up classes and IDs
    mainContent.find('*').removeAttr('class').removeAttr('id');
  }

  private isFetchDocsArgs(args: unknown): args is FetchDocsArgs {
    return (
      typeof args === 'object' &&
      args !== null &&
      'url' in args &&
      typeof (args as any).url === 'string' &&
      (!(args as any).selector || typeof (args as any).selector === 'string') &&
      (!(args as any).outputPath || typeof (args as any).outputPath === 'string') &&
      (!(args as any).recursive || typeof (args as any).recursive === 'boolean') &&
      (!(args as any).maxDepth || typeof (args as any).maxDepth === 'number') &&
      (!(args as any).splitByHeaders || typeof (args as any).splitByHeaders === 'boolean')
    );
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Dev Docs MCP server running on stdio');
  }
}

const server = new DevDocsServer();
server.run().catch(console.error);
