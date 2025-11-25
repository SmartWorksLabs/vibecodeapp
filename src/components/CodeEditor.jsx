import Editor from '@monaco-editor/react'
import './CodeEditor.css'

function CodeEditor({ file, onFileUpdate, lineNumbers = true, tabSize = 2 }) {
  const getLanguage = (fileName) => {
    if (fileName.endsWith('.html')) return 'html'
    if (fileName.endsWith('.css')) return 'css'
    if (fileName.endsWith('.js')) return 'javascript'
    return 'plaintext'
  }

  if (!file) {
    return (
      <div className="code-editor">
        <div className="code-editor-header">
          <h3>Code Editor</h3>
        </div>
        <div className="code-editor-empty">
          <p>Select a file to view its code</p>
        </div>
      </div>
    )
  }

  const fileType = file.name.split('.').pop().toUpperCase()

  return (
    <div className="code-editor">
      <div className="code-editor-header">
        <h3 title={file.name}>{file.name}</h3>
        <span className="file-type">{fileType}</span>
      </div>
      <div className="code-editor-content">
        <Editor
          height="100%"
          language={getLanguage(file.name)}
          value={file.content}
          onChange={(value) => onFileUpdate(value || '')}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 11,
            lineNumbers: lineNumbers ? 'on' : 'off',
            lineNumbersMinChars: 3,
            scrollBeyondLastLine: true, // Allow scrolling beyond last line to see end
            automaticLayout: true,
            wordWrap: 'on', // Always enabled
            tabSize: tabSize,
            renderWhitespace: 'none',
            folding: true,
            showFoldingControls: 'always',
            scrollbar: {
              vertical: 'auto',
              horizontal: 'auto',
              useShadows: false,
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8
            },
            padding: { top: 8, bottom: 32 }, // Extra bottom padding to ensure last line is visible
            lineHeight: 16,
            letterSpacing: 0.3
          }}
        />
      </div>
    </div>
  )
}

export default CodeEditor

