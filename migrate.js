const { Project, SyntaxKind, Node } = require('ts-morph');
const fs = require('fs');
const path = require('path');

const project = new Project();
project.addSourceFilesAtPaths("app/**/*.tsx");
project.addSourceFilesAtPaths("components/**/*.tsx");

const dict = {};

function slugify(text) {
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').substring(0, 30).replace(/_$/, '');
}

for (const sourceFile of project.getSourceFiles()) {
  const filePath = sourceFile.getFilePath();
  const componentName = path.basename(filePath, '.tsx').toLowerCase();
  
  // Skip some files
  if (filePath.includes('i18n') || filePath.includes('locales')) continue;
  
  const isClient = sourceFile.getText().includes('use client');
  
  let changed = false;
  const functionsToUpdate = new Set();
  
  const replacements = [];

  sourceFile.forEachDescendant(node => {
    // Check JsxText
    if (node.getKind() === SyntaxKind.JsxText) {
      const text = node.getText();
      const trimmed = text.trim();
      
      // Skip if empty, mostly spaces, contains {}, or mostly symbols
      if (trimmed.length > 1 && /[a-zA-Z]/.test(trimmed) && !text.includes('{') && !text.includes('}') && !text.includes('useI18n')) {
        const key = `auto.${componentName}.${slugify(trimmed)}`;
        dict[key] = trimmed;
        
        const parentFunc = node.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration) || 
                           node.getFirstAncestorByKind(SyntaxKind.ArrowFunction);
        
        if (parentFunc && parentFunc.getBody()) {
          functionsToUpdate.add(parentFunc);
          const parts = text.split(trimmed);
          replacements.push({
            node,
            text: `${parts[0]}{t("${key}")}${parts[1] || ''}`
          });
          changed = true;
        }
      }
    }
    
    // Check StringLiteral inside specific JsxAttributes
    if (node.getKind() === SyntaxKind.StringLiteral && node.getParent().getKind() === SyntaxKind.JsxAttribute) {
      const attrName = node.getParent().getNameNode().getText();
      if (['placeholder', 'title', 'alt', 'aria-label', 'label'].includes(attrName)) {
        const text = node.getLiteralValue();
        const trimmed = text.trim();
        if (trimmed.length > 0 && /[a-zA-Z]/.test(trimmed)) {
          const key = `auto.${componentName}.${slugify(trimmed)}`;
          dict[key] = trimmed;
          
          const parentFunc = node.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration) || 
                             node.getFirstAncestorByKind(SyntaxKind.ArrowFunction);
          
          if (parentFunc && parentFunc.getBody()) {
            functionsToUpdate.add(parentFunc);
            replacements.push({
              node,
              text: `{t("${key}")}`
            });
            changed = true;
          }
        }
      }
    }
  });

  if (changed) {
    // Apply replacements from bottom up so offsets aren't messed up
    replacements.sort((a, b) => b.node.getPos() - a.node.getPos());
    for (const rep of replacements) {
      rep.node.replaceWithText(rep.text);
    }
    
    // Add t declaration to functions
    for (const func of functionsToUpdate) {
      const body = func.getBody();
      if (Node.isBlock(body)) {
        // avoid double inserting
        if (!body.getText().includes('useI18n') && !body.getText().includes('getT(')) {
           const insertStr = isClient ? 'const { t } = useI18n();\n' : 'const t = getT();\n';
           body.insertStatements(0, insertStr);
        }
      }
    }
    
    // Add Imports
    const hasClientImport = sourceFile.getImportDeclarations().some(i => i.getModuleSpecifierValue() === '@/components/I18nProvider');
    const hasServerImport = sourceFile.getImportDeclarations().some(i => i.getModuleSpecifierValue() === '@/lib/serverI18n');
    
    const lastImport = sourceFile.getImportDeclarations().pop();
    const insertPos = lastImport ? lastImport.getEnd() : 0;
    
    if (isClient && !hasClientImport) {
       sourceFile.insertStatements(sourceFile.getImportDeclarations().length, `import { useI18n } from '@/components/I18nProvider';`);
    } else if (!isClient && !hasServerImport) {
       sourceFile.insertStatements(sourceFile.getImportDeclarations().length, `import { getT } from '@/lib/serverI18n';`);
    }

    sourceFile.saveSync();
    console.log(`Updated ${filePath}`);
  }
}

fs.writeFileSync('locales/auto_en.json', JSON.stringify(dict, null, 2));
console.log(`Generated locales/auto_en.json with ${Object.keys(dict).length} keys`);
