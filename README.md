# VibeCanvas - Visual Editor for Vibe-Coded Projects

A visual editor for static HTML/CSS/JS projects that allows you to edit your website visually without touching code.

## Features

- 📁 **Project Upload**: Drag & drop your project folder or select files
- 👁️ **Live Preview**: See your website rendered in real-time
- 🎯 **Element Inspector**: Click any element to select and edit it
- 🎨 **Visual Property Editor**: Edit colors, spacing, typography, and more
- 💻 **Code Editor**: View and edit your code with Monaco Editor
- 📦 **Export**: Download your modified project as a ZIP file

## Supported File Types

- `.html` files
- `.css` files
- `.js` files (vanilla JavaScript)

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser to `http://localhost:3000`

4. Upload your project:
   - Drag and drop your project folder
   - Or click "Select Files" to choose individual files
   - Or click "Select Folder" to browse for a folder

## Usage

1. **Upload Project**: Drop your HTML/CSS/JS project folder
2. **Select Element**: Click on any element in the preview to select it
3. **Edit Properties**: Use the properties panel on the right to change:
   - Text content
   - Colors (background, text, border)
   - Spacing (padding, margin)
   - Typography (font size)
   - Layout (width, height, display)
   - Borders (width, style, color, radius)
4. **View Code**: Click on files in the file tree to view/edit code
5. **Export**: Click "Export Project" to download your modified files

## Project Structure

```
vibecanvas/
├── src/
│   ├── components/
│   │   ├── FileUploader.jsx    # Drag & drop file upload
│   │   ├── FileTree.jsx         # Project file browser
│   │   ├── PreviewPane.jsx      # Live preview iframe
│   │   ├── PropertiesPanel.jsx # Visual property editor
│   │   ├── CodeEditor.jsx       # Monaco code editor
│   │   └── ExportButton.jsx     # Export to ZIP
│   ├── App.jsx                  # Main app component
│   └── main.jsx                 # Entry point
├── package.json
└── vite.config.js
```

## Technologies

- React 18
- Vite
- Monaco Editor
- JSZip
- File Saver

## License

MIT

