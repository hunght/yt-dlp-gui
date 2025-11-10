#!/usr/bin/env node
/**
 * Generate an HTML complexity report from ESLint JSON output (SonarJS)
 * Opens automatically in browser with clickable links to Cursor IDE
 * Usage: npm run lint:complexity:html
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Read ESLint JSON from stdin
let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const results = JSON.parse(input);
    const projectRoot = process.cwd();
    
    // Extract complexity-related messages
    const complexityIssues = [];
    
    results.forEach(file => {
      file.messages.forEach(msg => {
        if (
          msg.ruleId === 'sonarjs/cognitive-complexity' ||
          msg.ruleId === 'sonarjs/no-duplicate-string' ||
          msg.ruleId === 'sonarjs/no-identical-functions' ||
          msg.ruleId === 'sonarjs/no-duplicated-branches'
        ) {
          complexityIssues.push({
            file: file.filePath,
            line: msg.line,
            column: msg.column,
            rule: msg.ruleId,
            message: msg.message,
            severity: msg.severity === 2 ? 'error' : 'warn',
          });
        }
      });
    });

    if (complexityIssues.length === 0) {
      console.log('\n✅ No complexity issues found!\n');
      return;
    }

    // Group by file
    const byFile = {};
    complexityIssues.forEach(issue => {
      const shortPath = issue.file.replace(projectRoot + '/', '');
      if (!byFile[shortPath]) {
        byFile[shortPath] = [];
      }
      byFile[shortPath].push(issue);
    });

    // Sort files by cognitive complexity (highest first)
    const filesWithComplexity = Object.entries(byFile)
      .map(([file, issues]) => {
        const complexityIssue = issues.find(i => i.rule === 'sonarjs/cognitive-complexity');
        const complexity = complexityIssue 
          ? parseInt(complexityIssue.message.match(/from (\d+) to/)?.[1] || '0')
          : 0;
        return { file, issues, complexity };
      })
      .sort((a, b) => b.complexity - a.complexity);

    // Calculate statistics
    const cognitiveIssues = complexityIssues.filter(i => i.rule === 'sonarjs/cognitive-complexity');
    const scores = cognitiveIssues.map(i => {
      const match = i.message.match(/from (\d+) to/);
      return match ? parseInt(match[1]) : 0;
    }).filter(s => s > 0);
    
    const avgComplexity = scores.reduce((a, b) => a + b, 0) / scores.length;
    const maxComplexity = Math.max(...scores);
    
    const critical = scores.filter(s => s > 50).length;
    const high = scores.filter(s => s > 30 && s <= 50).length;
    const medium = scores.filter(s => s > 20 && s <= 30).length;
    const low = scores.filter(s => s > 15 && s <= 20).length;

    // Generate HTML
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Code Complexity Report - ${new Date().toLocaleDateString()}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
            line-height: 1.6;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            overflow: hidden;
        }
        header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px;
            text-align: center;
        }
        h1 { font-size: 2.5em; margin-bottom: 10px; }
        .subtitle { opacity: 0.9; font-size: 1.1em; }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            padding: 30px;
            background: #f8f9fa;
            border-bottom: 3px solid #e9ecef;
        }
        .stat-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            text-align: center;
        }
        .stat-value {
            font-size: 2em;
            font-weight: bold;
            color: #667eea;
            margin-bottom: 5px;
        }
        .stat-label {
            color: #666;
            font-size: 0.9em;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .priority-badges {
            display: flex;
            justify-content: center;
            gap: 15px;
            padding: 20px;
            background: #fff;
            border-bottom: 2px solid #e9ecef;
        }
        .badge {
            padding: 10px 20px;
            border-radius: 20px;
            font-weight: 600;
            font-size: 0.9em;
        }
        .badge-critical { background: #ff6b6b; color: white; }
        .badge-high { background: #ff922b; color: white; }
        .badge-medium { background: #ffd43b; color: #333; }
        .badge-low { background: #69db7c; color: white; }
        .content { padding: 30px; }
        .file-section {
            margin-bottom: 30px;
            border: 2px solid #e9ecef;
            border-radius: 8px;
            overflow: hidden;
        }
        .file-header {
            background: linear-gradient(90deg, #667eea, #764ba2);
            color: white;
            padding: 15px 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .file-path {
            font-family: 'Monaco', 'Courier New', monospace;
            font-size: 1em;
            font-weight: 600;
        }
        .complexity-badge {
            padding: 5px 15px;
            border-radius: 15px;
            font-weight: bold;
            font-size: 0.9em;
        }
        .complexity-critical { background: #ff6b6b; }
        .complexity-high { background: #ff922b; }
        .complexity-medium { background: #ffd43b; color: #333; }
        .complexity-low { background: #69db7c; }
        .issue {
            padding: 20px;
            border-bottom: 1px solid #e9ecef;
            transition: background 0.2s;
        }
        .issue:hover {
            background: #f8f9fa;
        }
        .issue:last-child {
            border-bottom: none;
        }
        .issue-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 10px;
        }
        .issue-icon {
            font-size: 1.2em;
        }
        .issue-location {
            font-family: 'Monaco', 'Courier New', monospace;
            color: #667eea;
            font-weight: 600;
            cursor: pointer;
            text-decoration: none;
            padding: 5px 10px;
            background: #f0f2ff;
            border-radius: 5px;
            transition: all 0.2s;
        }
        .issue-location:hover {
            background: #667eea;
            color: white;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
        }
        .issue-message {
            color: #495057;
            margin-left: 32px;
        }
        .complexity-bar {
            margin: 10px 0 10px 32px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .bar-container {
            flex: 1;
            max-width: 500px;
            height: 20px;
            background: #e9ecef;
            border-radius: 10px;
            overflow: hidden;
        }
        .bar-fill {
            height: 100%;
            background: linear-gradient(90deg, #51cf66, #ffd43b, #ff922b, #ff6b6b);
            transition: width 0.3s;
        }
        .bar-score {
            font-weight: bold;
            font-family: 'Monaco', 'Courier New', monospace;
        }
        footer {
            padding: 30px;
            background: #f8f9fa;
            border-top: 3px solid #e9ecef;
            text-align: center;
            color: #666;
        }
        .footer-links {
            margin-top: 15px;
            display: flex;
            justify-content: center;
            gap: 30px;
        }
        .footer-link {
            color: #667eea;
            text-decoration: none;
            font-weight: 600;
        }
        .footer-link:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>📊 Code Complexity Report</h1>
            <div class="subtitle">SonarJS Cognitive Complexity Analysis · Generated ${new Date().toLocaleString()}</div>
        </header>

        <div class="stats">
            <div class="stat-card">
                <div class="stat-value">${cognitiveIssues.length}</div>
                <div class="stat-label">Functions with Issues</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${avgComplexity.toFixed(1)}</div>
                <div class="stat-label">Average Complexity</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${maxComplexity}</div>
                <div class="stat-label">Max Complexity</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${Object.keys(byFile).length}</div>
                <div class="stat-label">Files Affected</div>
            </div>
        </div>

        <div class="priority-badges">
            ${critical > 0 ? `<div class="badge badge-critical">🔴 Critical: ${critical}</div>` : ''}
            ${high > 0 ? `<div class="badge badge-high">🟠 High: ${high}</div>` : ''}
            ${medium > 0 ? `<div class="badge badge-medium">🟡 Medium: ${medium}</div>` : ''}
            ${low > 0 ? `<div class="badge badge-low">🟢 Low: ${low}</div>` : ''}
        </div>

        <div class="content">
            ${filesWithComplexity.map(({ file, issues, complexity }) => {
              const priorityClass = complexity > 50 ? 'critical' : complexity > 30 ? 'high' : complexity > 20 ? 'medium' : 'low';
              const priorityEmoji = complexity > 50 ? '🔴' : complexity > 30 ? '🟠' : complexity > 20 ? '🟡' : '🟢';
              
              return `
                <div class="file-section">
                    <div class="file-header">
                        <span class="file-path">📁 ${file}</span>
                        ${complexity > 0 ? `<span class="complexity-badge complexity-${priorityClass}">${priorityEmoji} Cognitive: ${complexity}/15</span>` : ''}
                    </div>
                    ${issues.map(issue => {
                      const cognitiveScore = issue.message.match(/from (\\d+) to/)?.[1];
                      const barWidth = cognitiveScore ? Math.min((parseInt(cognitiveScore) / 50) * 100, 100) : 0;
                      
                      // Create Cursor IDE link (uses vscode:// protocol)
                      const cursorLink = `vscode://file${issue.file}:${issue.line}:${issue.column}`;
                      
                      return `
                        <div class="issue">
                            <div class="issue-header">
                                <span class="issue-icon">${issue.severity === 'error' ? '❌' : '⚠️'}</span>
                                <a href="${cursorLink}" class="issue-location" title="Open in Cursor IDE">
                                    Line ${issue.line}:${issue.column}
                                </a>
                            </div>
                            <div class="issue-message">${issue.message}</div>
                            ${cognitiveScore ? `
                                <div class="complexity-bar">
                                    <div class="bar-container">
                                        <div class="bar-fill" style="width: ${barWidth}%"></div>
                                    </div>
                                    <span class="bar-score">${cognitiveScore}</span>
                                </div>
                            ` : ''}
                        </div>
                      `;
                    }).join('')}
                </div>
              `;
            }).join('')}
        </div>

        <footer>
            <div style="font-size: 1.2em; margin-bottom: 10px;">
                💡 <strong>Cognitive Complexity</strong> measures how difficult code is to understand
            </div>
            <div style="margin-bottom: 15px; color: #868e96;">
                Considers: Nested control flow · Logical operators · Recursion · Break statements
            </div>
            <div class="footer-links">
                <a href="file://${path.join(projectRoot, '.eslintrc-complexity.md')}" class="footer-link">📖 Refactoring Guide</a>
                <a href="https://github.com/SonarSource/eslint-plugin-sonarjs" class="footer-link" target="_blank">📚 SonarJS Docs</a>
                <a href="https://www.sonarsource.com/docs/CognitiveComplexity.pdf" class="footer-link" target="_blank">📄 Whitepaper</a>
            </div>
        </footer>
    </div>

    <script>
        // Add smooth scrolling
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });

        // Highlight on hover
        document.querySelectorAll('.issue').forEach(issue => {
            issue.addEventListener('mouseenter', function() {
                this.style.transform = 'translateX(5px)';
            });
            issue.addEventListener('mouseleave', function() {
                this.style.transform = 'translateX(0)';
            });
        });
    </script>
</body>
</html>`;

    // Write HTML to file
    const outputPath = path.join(projectRoot, 'complexity-report.html');
    fs.writeFileSync(outputPath, html);
    
    console.log(`\n✅ HTML report generated: ${outputPath}`);
    console.log('🌐 Opening in browser...\n');
    
    // Open in default browser
    const command = process.platform === 'darwin' ? 'open' : 
                    process.platform === 'win32' ? 'start' : 'xdg-open';
    
    exec(`${command} "${outputPath}"`, (error) => {
      if (error) {
        console.error('Could not open browser automatically. Please open manually:', outputPath);
      }
    });

  } catch (error) {
    console.error('Error generating HTML report:', error.message);
    process.exit(1);
  }
});

