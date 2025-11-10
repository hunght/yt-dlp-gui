#!/usr/bin/env node
/**
 * Generate a detailed complexity report from ESLint JSON output (SonarJS)
 * Usage: npm run lint:complexity
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
      const shortPath = issue.file.split('/src/').pop() || issue.file;
      if (!byFile[shortPath]) {
        byFile[shortPath] = [];
      }
      byFile[shortPath].push(issue);
    });

    // Print report
    console.log('\n📊 COGNITIVE COMPLEXITY REPORT (SonarJS)\n');
    console.log('=' .repeat(80));

    // Sort by cognitive complexity score (highest first)
    const filesWithComplexity = Object.entries(byFile)
      .map(([file, issues]) => {
        const complexityIssue = issues.find(i => i.rule === 'sonarjs/cognitive-complexity');
        const complexity = complexityIssue
          ? parseInt(complexityIssue.message.match(/from (\d+) to/)?.[1] || '0')
          : 0;
        return { file, issues, complexity };
      })
      .sort((a, b) => b.complexity - a.complexity);

    filesWithComplexity.forEach(({ file, issues, complexity }) => {
      console.log(`\n📁 ${file}`);
      if (complexity > 0) {
        const emoji = complexity > 50 ? '🔴' : complexity > 30 ? '🟠' : complexity > 20 ? '🟡' : '⚠️';
        console.log(`   ${emoji} Cognitive Complexity: ${complexity}/15`);
      }
      console.log('-'.repeat(80));

      issues
        .sort((a, b) => a.line - b.line)
        .forEach(issue => {
          const emoji = issue.severity === 'error' ? '❌' : '⚠️';
          const cognitiveScore = issue.message.match(/from (\d+) to/)?.[1];

          console.log(`  ${emoji} Line ${issue.line}:${issue.column}`);
          console.log(`     ${issue.message}`);

          if (cognitiveScore) {
            const score = parseInt(cognitiveScore);
            const barLength = Math.min(Math.floor(score / 2), 50);
            const bar = '█'.repeat(barLength);
            console.log(`     Cognitive: ${bar} ${score}`);
          }
          console.log('');
        });
    });

    // Summary statistics
    const cognitiveIssues = complexityIssues.filter(i => i.rule === 'sonarjs/cognitive-complexity');
    if (cognitiveIssues.length > 0) {
      const scores = cognitiveIssues.map(i => {
        const match = i.message.match(/from (\d+) to/);
        return match ? parseInt(match[1]) : 0;
      }).filter(s => s > 0);

      const avgComplexity = scores.reduce((a, b) => a + b, 0) / scores.length;
      const maxComplexity = Math.max(...scores);

      console.log('\n' + '='.repeat(80));
      console.log('📈 SUMMARY');
      console.log('-'.repeat(80));
      console.log(`Total cognitive complexity issues: ${cognitiveIssues.length}`);
      console.log(`Average cognitive complexity: ${avgComplexity.toFixed(1)} (target: ≤15)`);
      console.log(`Maximum cognitive complexity: ${maxComplexity} (target: ≤15)`);
      console.log(`Files affected: ${Object.keys(byFile).length}`);

      // Priority breakdown
      const critical = scores.filter(s => s > 50).length;
      const high = scores.filter(s => s > 30 && s <= 50).length;
      const medium = scores.filter(s => s > 20 && s <= 30).length;
      const low = scores.filter(s => s > 15 && s <= 20).length;

      console.log('\n🎯 Priority Breakdown:');
      if (critical > 0) console.log(`   🔴 Critical (>50): ${critical} functions`);
      if (high > 0) console.log(`   🟠 High (30-50): ${high} functions`);
      if (medium > 0) console.log(`   🟡 Medium (20-30): ${medium} functions`);
      if (low > 0) console.log(`   🟢 Low (15-20): ${low} functions`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('💡 Cognitive Complexity measures:');
    console.log('   - Nested control flow (if, loops, switch)');
    console.log('   - Logical operators (&& and ||)');
    console.log('   - Recursive calls');
    console.log('   - Breaks in control flow (break, continue, return)');
    console.log('\n📖 Guide: apps/electron/.eslintrc-complexity.md\n');

  } catch (error) {
    console.error('Error parsing ESLint output:', error.message);
    process.exit(1);
  }
});
