import { useRef, useState } from 'react'
import './FileUploader.css'

function FileUploader({ onProjectLoad }) {
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef(null)

  const readFiles = async (files) => {
    const projectFiles = []
    
    console.log('FileUploader: Reading files', {
      totalFiles: files.length,
      fileNames: Array.from(files).map(f => f.name)
    })
    
    for (const file of files) {
      const isTextFile = file.name.endsWith('.html') ||
                        file.name.endsWith('.css') ||
                        file.name.endsWith('.js');
      
      const isImageFile = file.name.endsWith('.jpg') ||
                         file.name.endsWith('.jpeg') ||
                         file.name.endsWith('.png') ||
                         file.name.endsWith('.gif') ||
                         file.name.endsWith('.webp') ||
                         file.name.endsWith('.svg');
      
      if (isTextFile || isImageFile) {
        try {
          let content;
          let dataUrl = null;
          
          if (isImageFile) {
            // For images, create a data URL
            const arrayBuffer = await file.arrayBuffer();
            const blob = new Blob([arrayBuffer], { type: file.type });
            dataUrl = URL.createObjectURL(blob);
            content = dataUrl; // Store the blob URL as content
          } else {
            // For text files, read as text
            content = await file.text();
          }
          
          projectFiles.push({
            name: file.name,
            path: file.webkitRelativePath || file.name,
            content: content,
            type: file.name.split('.').pop(),
            isImage: isImageFile,
            dataUrl: dataUrl
          })
          console.log(`Loaded file: ${file.name} (${isImageFile ? 'image' : content.length + ' chars'})`)
        } catch (error) {
          console.error(`Error reading file ${file.name}:`, error)
        }
      } else {
        console.log(`Skipping file: ${file.name} (not supported file type)`)
      }
    }
    
    console.log('FileUploader: Loaded files summary', {
      total: projectFiles.length,
      html: projectFiles.filter(f => f.type === 'html').length,
      css: projectFiles.filter(f => f.type === 'css').length,
      js: projectFiles.filter(f => f.type === 'js').length,
      images: projectFiles.filter(f => f.isImage).length,
      fileNames: projectFiles.map(f => f.name)
    })
    
    if (projectFiles.length > 0) {
      onProjectLoad(projectFiles)
    } else {
      console.warn('No valid files found to load')
    }
  }

  const handleDrop = async (e) => {
    e.preventDefault()
    setIsDragging(false)
    
    const items = Array.from(e.dataTransfer.items)
    const files = []
    
    // Handle both files and directory drops
    for (const item of items) {
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null
        if (entry) {
          if (entry.isFile) {
            files.push(item.getAsFile())
          } else if (entry.isDirectory) {
            // For directories, we need to traverse them
            // But DataTransfer API doesn't support this well
            // So we'll show a message to use the folder selector instead
            alert('Please use the "Select Folder" button to upload folders with subdirectories. Drag and drop only works for files in the root folder.')
            return
          }
        } else {
          // Fallback for browsers that don't support webkitGetAsEntry
          const file = item.getAsFile()
          if (file) files.push(file)
        }
      }
    }
    
    // Also get files directly (fallback)
    const directFiles = Array.from(e.dataTransfer.files)
    directFiles.forEach(file => {
      if (!files.find(f => f.name === file.name && f.size === file.size)) {
        files.push(file)
      }
    })
    
    await readFiles(files)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files)
    await readFiles(files)
  }

  const handleFolderSelect = async (e) => {
    const files = Array.from(e.target.files)
    console.log('Folder selected:', files.length, 'files')
    console.log('Files:', files.map(f => ({ name: f.name, path: f.webkitRelativePath })))
    await readFiles(files)
  }

  return (
    <div className="file-uploader">
      <div
        className={`upload-zone ${isDragging ? 'dragging' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div className="upload-content">
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <h2>Drop your project folder here</h2>
          <p>Or click to browse</p>
          <div className="upload-buttons">
            <button onClick={() => fileInputRef.current?.click()}>
              Select Files
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".html,.css,.js"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            <input
              type="file"
              webkitdirectory=""
              directory=""
              multiple
              onChange={handleFolderSelect}
              style={{ display: 'none' }}
              id="folder-input"
              accept=".html,.css,.js"
            />
            <button onClick={() => document.getElementById('folder-input')?.click()}>
              Select Folder
            </button>
          </div>
          <p className="upload-hint">
            Supports: .html, .css, .js files
          </p>
          <p className="upload-hint" style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>
            Tip: Use "Select Folder" for projects with subdirectories
          </p>
        </div>
      </div>
    </div>
  )
}

export default FileUploader

