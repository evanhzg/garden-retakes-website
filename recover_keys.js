const { execSync } = require('child_process');
const fs = require('fs');

// We look at the past 5 commits to find changes from literal text to t("key")
const diffOutput = execSync('git log -p -5 app components').toString();

const lines = diffOutput.split('\n');
const missingKeys = {};

let lastRemovedText = '';

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  if (line.startsWith('-') && !line.startsWith('---')) {
    // Try to extract text inside tags or quotes
    const textMatch = line.match(/>([^<{}]+)</) || line.match(/['"]([^'"{}\\]+)['"]/);
    if (textMatch && textMatch[1].trim().length > 0) {
      lastRemovedText = textMatch[1].trim();
    }
  } else if (line.startsWith('+') && !line.startsWith('+++')) {
    if (lastRemovedText) {
      const keyMatch = line.match(/t\(['"]([a-zA-Z0-9_.-]+)['"]/);
      if (keyMatch) {
        const key = keyMatch[1];
        if (!missingKeys[key]) {
          missingKeys[key] = lastRemovedText;
        }
      }
    }
    // reset after looking at additions (in case of multiple lines)
    if (!line.match(/t\(/)) {
       lastRemovedText = '';
    }
  } else {
    lastRemovedText = '';
  }
}

console.log('Recovered', Object.keys(missingKeys).length, 'keys from git diff.');
fs.writeFileSync('recovered_keys.json', JSON.stringify(missingKeys, null, 2));
