#!/usr/bin/env node
/**
 * Generate a detailed complexity report from ESLint JSON output
 * Usage: npm run lint -- --format json | node scripts/complexity-report.js
 */

const fs = require('fs');

// Read ESLint JSON from stdin
let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const results = JSON.parse(input);
    
    // Extract complexity-related messages
    const complexityIssues = [];
    
    results.forEach(file => {
      file.messages.forEach(msg => {
        if (
          msg.ruleId === 'complexity' ||
          msg.ruleId === 'max-lines-per-function' ||
          msg.ruleId === 'max-lines' ||
          msg.ruleId === 'max-depth' ||
          msg.ruleId === 'max-nested-callbacks'
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
      const shortPath = issue.file.split('/src/').pop() || issue.file;
      if (!byFile[shortPath]) {
        byFile[shortPath] = [];
      }
      byFile[shortPath].push(issue);
    });

    // Print report
    console.log('\n📊 CODE COMPLEXITY REPORT\n');
    console.log('=' .repeat(80));

    Object.entries(byFile)
      .sort((a, b) => b[1].length - a[1].length)
      .forEach(([file, issues]) => {
        console.log(`\n📁 ${file}`);
        console.log('-'.repeat(80));
        
        issues
          .sort((a, b) => a.line - b.line)
          .forEach(issue => {
            const emoji = issue.severity === 'error' ? '❌' : '⚠️';
            const complexity = issue.message.match(/complexity of (\d+)/)?.[1];
            const lines = issue.message.match(/(\d+) lines/)?.[1];
            
            console.log(`  ${emoji} Line ${issue.line}:${issue.column}`);
            console.log(`     ${issue.message}`);
            
            if (complexity) {
              const score = parseInt(complexity);
              const bar = '█'.repeat(Math.min(score, 50));
              console.log(`     Complexity: ${bar} ${score}`);
            }
            console.log('');
          });
      });

    // Summary statistics
    const complexityIssuesOnly = complexityIssues.filter(i => i.rule === 'complexity');
    if (complexityIssuesOnly.length > 0) {
      const scores = complexityIssuesOnly.map(i => {
        const match = i.message.match(/complexity of (\d+)/);
        return match ? parseInt(match[1]) : 0;
      }).filter(s => s > 0);
      
      const avgComplexity = scores.reduce((a, b) => a + b, 0) / scores.length;
      const maxComplexity = Math.max(...scores);
      
      console.log('\n' + '='.repeat(80));
      console.log('📈 SUMMARY');
      console.log('-'.repeat(80));
      console.log(`Total complexity issues: ${complexityIssuesOnly.length}`);
      console.log(`Average complexity: ${avgComplexity.toFixed(1)} (target: ≤15)`);
      console.log(`Maximum complexity: ${maxComplexity} (target: ≤15)`);
      console.log(`Files affected: ${Object.keys(byFile).length}`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('💡 To fix: npm run lint:fix (for auto-fixable issues)');
    console.log('📖 Guide: apps/electron/.eslintrc-complexity.md\n');

  } catch (error) {
    console.error('Error parsing ESLint output:', error.message);
    process.exit(1);
  }
});

