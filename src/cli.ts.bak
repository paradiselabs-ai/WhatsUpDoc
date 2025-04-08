#!/usr/bin/env node
import { Command } from 'commander';
import { spawn } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';
import * as os from 'os';
import * as fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Options {
  selector?: string;
  output?: string;
  recursive?: boolean;
  maxDepth?: string;
  split?: boolean;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params: {
    name: string;
    arguments?: {
      url: string;
      selector?: string;
      outputPath?: string;
      recursive?: boolean;
      maxDepth?: number;
      splitByHeaders?: boolean;
    };
  };
  id: number;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  result?: {
    content?: Array<{
      type: string;
      text: string;
    }>;
  };
  error?: {
    code: number;
    message: string;
  };
  id: number;
}

const program = new Command();

program
  .name('docmd')
  .description('WhatsUpDoc: CLI to fetch and save developer documentation')
  .version('0.1.0');

program
  .command('fetch')
  .description('Fetch documentation from a URL')
  .argument('<url>', 'URL of the documentation page')
  .option('-s, --selector <selector>', 'CSS selector to target specific content')
  .option('-o, --output <path>', 'Output path (absolute or relative)')
  .option('-r, --recursive', 'Recursively fetch linked documentation pages', false)
  .option('-d, --max-depth <number>', 'Maximum depth for recursive fetching', '3')
  .option('--split', 'Split documentation by headers into separate files', false)
  .action(async (url: string, options: Options) => {
    // Create readline interface for user input
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    // If output path is not provided, prompt the user
    if (!options.output) {
      const defaultPath = path.join(process.cwd(), getDefaultOutputName(url));
      await new Promise<void>((resolve) => {
        rl.question(`Enter output path (default: ${defaultPath}): `, (answer) => {
          options.output = answer.trim() || defaultPath;
          resolve();
        });
      });
    }

    rl.close();

    // Resolve relative paths to absolute paths
    let outputPath = options.output || '';
    if (!path.isAbsolute(outputPath)) {
      outputPath = path.resolve(process.cwd(), outputPath);
    }

    // Ensure the directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const serverPath = path.join(__dirname, 'index.js');
    const child = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'inherit']
    });

    const request = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'fetch_docs',
        arguments: {
          url,
          selector: options.selector || undefined,
          outputPath: outputPath,
          recursive: options.recursive || false,
          maxDepth: options.maxDepth ? parseInt(options.maxDepth) : undefined,
          splitByHeaders: options.split || false
        }
      },
      id: 1
    };

    child.stdin.write(JSON.stringify(request) + '\n');

    let output = '';
    child.stdout.on('data', (data: Buffer) => {
      output += data.toString();
      if (output.includes('\n')) {
        const lines = output.split('\n');
        output = lines.pop() || '';
        for (const line of lines) {
          try {
            const response = JSON.parse(line) as JsonRpcResponse;
            if (response.result?.content?.[0]?.text) {
              console.log(response.result.content[0].text);
            } else if (response.error) {
              console.error('Error:', response.error.message);
            }
          } catch (e) {
            // Ignore invalid JSON
          }
        }
      }
    });

    child.on('close', () => {
      process.exit(0);
    });
  });

// Helper function to generate a default output name from URL
function getDefaultOutputName(url: string): string {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const pathSegments = urlObj.pathname.split('/').filter(Boolean);
    const lastSegment = pathSegments.pop() || '';
    
    // Remove file extension if present
    const baseName = lastSegment.replace(/\.[^/.]+$/, '');
    
    return `${hostname}-${baseName || 'docs'}.md`;
  } catch (e) {
    return 'documentation.md';
  }
}

program.parse();
