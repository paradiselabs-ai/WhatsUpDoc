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
  .option('-r, --recursive', 'Recursively fetch linked documentation pages', false)
  .option('-d, --max-depth <number>', 'Maximum depth for recursive fetching', '3')
  .option('--split', 'Split documentation by headers into separate files', false)
  .action(async (url: string, options: Options) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    const hostDir = extractSiteName(url);
    const suggestedDir = path.join(process.cwd(), hostDir);

    await new Promise<void>((resolve) => {
      rl.question(`Enter output directory (default: ${suggestedDir}): `, (answer) => {
        const userDir = answer.trim() || suggestedDir;
        options.output = userDir;
        resolve();
      });
    });
    rl.close();

    let outputDir = options.output || suggestedDir;
    if (!path.isAbsolute(outputDir)) {
      outputDir = path.resolve(process.cwd(), outputDir);
    }

    try {
      const stats = fs.statSync(outputDir);
      if (!stats.isDirectory()) {
        outputDir = path.dirname(outputDir);
      }
    } catch {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const serverPath = path.join(__dirname, 'index.js');
    const child = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    const request = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'fetch_docs',
        arguments: {
          url,
          selector: options.selector || undefined,
          outputPath: outputDir,
          recursive: options.recursive || false,
          maxDepth: options.maxDepth ? parseInt(options.maxDepth) : undefined,
          splitByHeaders: options.split || false,
        },
      },
      id: 1,
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
          } catch {}
        }
      }
    });
    child.on('close', () => process.exit(0));
  });

function extractSiteName(url: string): string {
  try {
    const { hostname } = new URL(url);
    return hostname.replace(/[^a-zA-Z0-9-_]/g, '_');
  } catch {
    return 'docs';
  }
}

program.parse();
