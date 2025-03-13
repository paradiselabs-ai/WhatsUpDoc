# DownMarked

A command-line tool for fetching and storing developer documentation locally using the Model Context Protocol (MCP).

[![npm version](https://img.shields.io/npm/v/docmd.svg)](https://www.npmjs.com/package/docmd)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- Fetch documentation from any website and convert it to Markdown
- Save documentation to any location on your system
- Target specific content using CSS selectors
- Recursively fetch linked documentation pages
- Split documentation by headers into separate files
- Uses the Model Context Protocol (MCP) for standardized communication

## Installation

```bash
# Install globally
npm install -g docmd

# Or use with npx
npx docmd fetch https://reactjs.org/docs/getting-started.html
```

## Usage

### Basic Usage

```bash
docmd fetch <url>
```

This will prompt you for an output location and save the documentation as Markdown.

### Options

```bash
# Fetch documentation with specific options
docmd fetch https://reactjs.org/docs/getting-started.html \
  -o ~/Documents/react-docs.md \
  -s "main" \
  -r \
  -d 2 \
  --split
```

### Available Options

| Option | Description |
|--------|-------------|
| `-o, --output <path>` | Output path (absolute or relative) |
| `-s, --selector <selector>` | CSS selector to target specific content |
| `-r, --recursive` | Recursively fetch linked documentation pages |
| `-d, --max-depth <number>` | Maximum depth for recursive fetching (default: 3) |
| `--split` | Split documentation by headers into separate files |

## Examples

### Fetch React Documentation

```bash
# Save React documentation to a specific location
docmd fetch https://reactjs.org/docs/getting-started.html -o ~/Documents/react-docs.md

# Target only the main content area
docmd fetch https://reactjs.org/docs/getting-started.html -s "main"

# Recursively fetch linked pages up to 2 levels deep
docmd fetch https://reactjs.org/docs/getting-started.html -r -d 2
```

### Fetch Python Documentation

```bash
# Save Python documentation
docmd fetch https://docs.python.org/3/tutorial/index.html -o python-tutorial.md
```

## How It Works

WhatsUpDoc (docmd) uses the Model Context Protocol (MCP) to standardize communication between the CLI and the documentation server. The tool:

1. Fetches HTML content from the specified URL
2. Parses the HTML using Cheerio
3. Converts the HTML to Markdown using Turndown
4. Saves the Markdown to the specified location

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [Model Context Protocol (MCP)](https://github.com/modelcontextprotocol/mcp) for providing the communication framework
- [Turndown](https://github.com/mixmark-io/turndown) for HTML to Markdown conversion
- [Cheerio](https://github.com/cheeriojs/cheerio) for HTML parsing
