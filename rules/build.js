const fs = require('fs');
const path = require('path');

const firestoreRulesDir = path.join(__dirname);
const outputFile = path.join(__dirname, '..', 'firestore.rules');

// Orden de los archivos a concatenar - CONTROLFILE (repositorio maestro)
// Incluye todas las apps que comparten el Firestore
const files = [
  'base.rules',
  'controlFile.rules',
  'controlbio.rules',
  'controlciclo.rules',
  'controlRemito.rules',
  'controlgastos.rules',
  'controllaudit.rules',
  'controlstore.rules',
  'horarios.rules'
];

// Encabezado del archivo
let content = `rules_version = '2';\n\n`;
content += `service cloud.firestore {\n`;
content += `  match /databases/{db}/documents {\n\n`;

// Leer y concatenar cada archivo
files.forEach((file) => {
  const filePath = path.join(firestoreRulesDir, file);
  if (fs.existsSync(filePath)) {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    
    // Agregar comentario de sección
    const sectionName = file.replace('.rules', '').toUpperCase().replace('-', '');
    content += `    /* ========= ${sectionName} ========= */\n`;
    content += `    \n`;
    
    // Agregar indentación a cada línea del contenido (4 espacios base)
    const indentedContent = fileContent
      .split('\n')
      .map(line => {
        if (line.trim() === '') return '    '; // Mantener líneas vacías con indentación
        return `    ${line}`;
      })
      .join('\n');
    
    content += indentedContent + '\n\n';
  } else {
    console.warn(`⚠️  Archivo no encontrado: ${filePath}`);
  }
});

// Footer con deny por defecto
content += `    /* ========= DENY POR DEFECTO ========= */\n\n`;
content += `    match /{document=**} {\n`;
content += `      allow read, write: if false;\n`;
content += `    }\n`;
content += `  }\n`;
content += `}\n`;

// Escribir el archivo concatenado
fs.writeFileSync(outputFile, content, 'utf8');

console.log('✅ Reglas de Firestore concatenadas exitosamente en firestore.rules');
console.log(`📝 Total de líneas: ${content.split('\n').length}`);

