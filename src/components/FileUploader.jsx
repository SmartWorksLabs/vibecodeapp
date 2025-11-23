import { useRef, useState, useEffect } from 'react'
import './FileUploader.css'

function FileUploader({ onProjectLoad }) {
  const [isDragging, setIsDragging] = useState(false)
  const [recentProjects, setRecentProjects] = useState([])
  const [showAllProjects, setShowAllProjects] = useState(false)
  const [showFilesInfo, setShowFilesInfo] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, right: 0 })
  const folderInputRef = useRef(null)
  const fileInputRef = useRef(null)
  const openFilesButtonRef = useRef(null)
  
  const MAX_INITIAL_PROJECTS = 3

  // Load recent projects from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('vibecanvas_recent_projects')
    if (stored) {
      try {
        setRecentProjects(JSON.parse(stored))
      } catch (e) {
        console.error('Error loading recent projects:', e)
      }
    }
  }, [])

  // Handle 'i' key press to toggle info tooltip
  useEffect(() => {
    const handleKeyPress = (e) => {
      // Only trigger if 'i' is pressed and no input is focused
      if ((e.key === 'i' || e.key === 'I') && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        setShowFilesInfo(prev => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [])

  const saveToRecentProjects = (projectName, files) => {
    // Check if files have content before saving
    const filesWithContent = files.filter(f => f.content !== undefined && f.content !== null)
    
    if (filesWithContent.length === 0) {
      console.warn('No files with content to save to recent projects')
      return
    }
    
    const project = {
      name: projectName || 'Untitled Project',
      fileCount: files.length,
      lastOpened: new Date().toISOString(),
      // Store full file content so we can reload the project
      files: files.map(f => {
        // Ensure we're storing the actual content
        const fileData = { 
          name: f.name, 
          type: f.type,
          path: f.path || f.name,
          isImage: f.isImage || false,
        }
        
        // Only include content if it exists
        if (f.content !== undefined && f.content !== null) {
          fileData.content = f.content
        }
        
        // Include dataUrl for images if it exists
        if (f.dataUrl) {
          fileData.dataUrl = f.dataUrl
        }
        
        return fileData
      }),
      path: files[0]?.path?.split('/')[0] || projectName // Store folder path for reference
    }

    const updated = [
      project,
      ...recentProjects.filter(p => p.name !== project.name && p.path !== project.path)
    ].slice(0, 10) // Keep last 10

    setRecentProjects(updated)
    try {
      const serialized = JSON.stringify(updated)
      localStorage.setItem('vibecanvas_recent_projects', serialized)
      console.log('Saved recent project with', filesWithContent.length, 'files containing content')
    } catch (e) {
      console.warn('Could not save recent projects to localStorage (may be too large):', e)
      // If storage is full, try saving without file content
      const projectsWithoutContent = updated.map(p => ({
        ...p,
        files: p.files.map(f => ({ name: f.name, type: f.type, path: f.path }))
      }))
      localStorage.setItem('vibecanvas_recent_projects', JSON.stringify(projectsWithoutContent))
      console.warn('Saved recent projects without file content due to storage limits')
    }
  }

  const openRecentProject = (project) => {
    // Check if project has file content stored
    if (!project.files || project.files.length === 0) {
      console.warn('Recent project has no files stored, opening folder picker instead')
      folderInputRef.current?.click()
      return
    }
    
    // Check if files have content
    const filesWithContent = project.files.filter(f => f.content !== undefined && f.content !== null)
    console.log('Recent project files check:', {
      totalFiles: project.files.length,
      filesWithContent: filesWithContent.length,
      fileDetails: project.files.map(f => ({ name: f.name, hasContent: f.content !== undefined && f.content !== null }))
    })
    
    // If no content, this is an old project - just open folder picker
    if (filesWithContent.length === 0) {
      console.warn('Recent project files have no content stored (old format), opening folder picker instead')
      folderInputRef.current?.click()
      return
    }
    
    // Convert stored files back to the format expected by onProjectLoad
    const files = project.files.map(f => {
      const file = {
        name: f.name,
        type: f.type,
        path: f.path || f.name,
        isImage: f.isImage || false,
        dataUrl: f.dataUrl || null
      }
      
      // Only include content if it exists
      if (f.content !== undefined && f.content !== null) {
        file.content = f.content
      } else {
        // If content is missing, use empty string (will show error but won't crash)
        console.warn(`File ${f.name} has no content stored`)
        file.content = ''
      }
      
      return file
    })
    
    console.log('Opening recent project:', project.name, 'with', files.length, 'files (', filesWithContent.length, 'with content)')
    
    // Update last opened time
    const updated = recentProjects.map(p => 
      p.path === project.path 
        ? { ...p, lastOpened: new Date().toISOString() }
        : p
    )
    setRecentProjects(updated)
    try {
      localStorage.setItem('vibecanvas_recent_projects', JSON.stringify(updated))
    } catch (e) {
      console.warn('Could not update recent projects:', e)
    }
    
    // Load the project
    onProjectLoad(files)
  }

  const removeRecentProject = (projectPath, e) => {
    e.stopPropagation() // Prevent opening the project when clicking X
    const updated = recentProjects.filter(p => p.path !== projectPath)
    setRecentProjects(updated)
    localStorage.setItem('vibecanvas_recent_projects', JSON.stringify(updated))
  }

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
            const arrayBuffer = await file.arrayBuffer();
            const blob = new Blob([arrayBuffer], { type: file.type });
            dataUrl = URL.createObjectURL(blob);
            content = dataUrl;
          } else {
            content = await file.text();
          }
          
          const extension = file.name.split('.').pop().toLowerCase()
          let fileType = extension
          
          if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension)) {
            fileType = extension === 'svg' ? 'svg' : 
                       ['jpg', 'jpeg'].includes(extension) ? 'jpg' : extension
          }
          
          projectFiles.push({
            name: file.name,
            path: file.webkitRelativePath || file.name,
            content: content,
            type: fileType,
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
    
    const htmlCount = projectFiles.filter(f => f.type === 'html').length
    const cssCount = projectFiles.filter(f => f.type === 'css').length
    
    console.log('FileUploader: Loaded files summary', {
      total: projectFiles.length,
      html: htmlCount,
      css: cssCount,
      js: projectFiles.filter(f => f.type === 'js').length,
      images: projectFiles.filter(f => f.isImage).length,
      fileNames: projectFiles.map(f => f.name)
    })
    
    // Warn if HTML files but no CSS files
    if (htmlCount > 0 && cssCount === 0) {
      console.warn('⚠️ HTML file(s) loaded but no CSS files found. Styling may not work correctly.')
      console.warn('💡 TIP: When opening individual files, select BOTH your HTML and CSS files together (hold Cmd/Ctrl to select multiple).')
    }
    
    if (projectFiles.length > 0) {
      // Get project name from folder name or first HTML file
      const folderName = projectFiles[0]?.path?.split('/')[0] || 
                        projectFiles.find(f => f.type === 'html')?.name?.replace('.html', '') || 
                        'Untitled Project'
      saveToRecentProjects(folderName, projectFiles)
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
    
    for (const item of items) {
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null
        if (entry) {
          if (entry.isFile) {
            files.push(item.getAsFile())
          } else if (entry.isDirectory) {
            alert('Please use "Open Project" to upload folders with subdirectories.')
            return
          }
        } else {
          const file = item.getAsFile()
          if (file) files.push(file)
        }
      }
    }
    
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

  const handleFolderSelect = async (e) => {
    const files = Array.from(e.target.files)
    await readFiles(files)
  }

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files)
    await readFiles(files)
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  return (
      <div
      className={`file-uploader ${isDragging ? 'dragging' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
      <div className="upload-container">
        <header className="upload-header">
          <div className="app-brand">
            <svg className="app-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 9h6v6H9z" />
            </svg>
            <span className="app-name">VibeCanvas</span>
          </div>
          <button 
            className="open-project-button"
            onClick={() => folderInputRef.current?.click()}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Open Project
          </button>
        </header>

        <main className="upload-main">
          <div className="main-content">
            <h1 className="welcome-title">Welcome</h1>
            <p className="welcome-subtitle">Open a project to get started</p>

            {recentProjects.length > 0 ? (
              <div className="recent-projects">
                <h2 className="section-title">Recent Projects</h2>
                <div className="projects-grid">
                  {(showAllProjects ? recentProjects : recentProjects.slice(0, MAX_INITIAL_PROJECTS)).map((project, displayIndex) => {
                    return (
                    <div 
                      key={project.path || project.name || displayIndex} 
                      className="project-card"
                      onClick={() => openRecentProject(project)}
                      title={`Click to open ${project.name}`}
                    >
                      <button 
                        className="project-remove"
                        onClick={(e) => removeRecentProject(project.path, e)}
                        aria-label="Remove project"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                      <div className="project-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                        </svg>
                      </div>
                      <div className="project-info">
                        <div className="project-name">{project.name}</div>
                        <div className="project-meta">
                          {project.fileCount} file{project.fileCount !== 1 ? 's' : ''} • {formatDate(project.lastOpened)}
                        </div>
                      </div>
                    </div>
                    )
                  })}
                </div>
                {recentProjects.length > MAX_INITIAL_PROJECTS && (
                  <button 
                    className="view-all-button"
                    onClick={() => setShowAllProjects(!showAllProjects)}
                  >
                    {showAllProjects ? 'Show Less' : `View All (${recentProjects.length})`}
                  </button>
                )}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <p className="empty-text">No recent projects</p>
                <p className="empty-hint">Open a project to get started</p>
              </div>
            )}

            <div className="quick-actions">
              <button 
                className="action-button"
                onClick={() => folderInputRef.current?.click()}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                Open Folder
              </button>
              <div className="action-button-wrapper">
                <button 
                  ref={openFilesButtonRef}
                  className="action-button secondary"
                  onClick={() => fileInputRef.current?.click()}
                  title="Select HTML, CSS, and JS files together (hold Cmd/Ctrl to select multiple)"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <span>Open Files</span>
                  <button
                    className="info-button-inline"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (openFilesButtonRef.current) {
                        const rect = openFilesButtonRef.current.getBoundingClientRect()
                        const tooltipWidth = 260
                        const tooltipHeight = 200 // approximate
                        const margin = 16
                        
                        // Calculate right position, ensuring it doesn't go off screen
                        let right = window.innerWidth - rect.right
                        if (right < margin) {
                          right = margin
                        }
                        
                        // Calculate top position, ensuring it doesn't go off screen
                        let top = rect.bottom + 8
                        if (top + tooltipHeight > window.innerHeight - margin) {
                          top = rect.top - tooltipHeight - 8
                          if (top < margin) {
                            top = margin
                          }
                        }
                        
                        setTooltipPosition({ top, right })
                      }
                      setShowFilesInfo(!showFilesInfo)
                    }}
                    aria-label="Show info about opening files"
                    title="Press 'i' for info"
                  >
                    <span className="info-icon-text">i</span>
                  </button>
                </button>
                {showFilesInfo && (
                  <div 
                    className="info-tooltip"
                    style={{
                      top: `${tooltipPosition.top}px`,
                      right: `${tooltipPosition.right}px`
                    }}
                  >
                    <div className="info-tooltip-content">
                      <button 
                        className="info-tooltip-close"
                        onClick={() => setShowFilesInfo(false)}
                        aria-label="Close"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                      <h3>Opening Multiple Files</h3>
                      <p>When using "Open Files", select <strong>all your project files together</strong>:</p>
                      <ul>
                        <li>HTML files</li>
                        <li>CSS files (for styling)</li>
                        <li>JavaScript files</li>
                        <li>Images (optional)</li>
                      </ul>
                      <p><strong>Tip:</strong> Hold <kbd>Cmd</kbd> (Mac) or <kbd>Ctrl</kbd> (Windows) to select multiple files at once.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>

            <input
          ref={folderInputRef}
              type="file"
              webkitdirectory=""
              directory=""
              multiple
              onChange={handleFolderSelect}
              style={{ display: 'none' }}
          accept=".html,.css,.js,.jpg,.jpeg,.png,.gif,.webp,.svg"
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          style={{ display: 'none' }}
          accept=".html,.css,.js,.jpg,.jpeg,.png,.gif,.webp,.svg"
            />
      </div>

      {isDragging && (
        <div className="drag-overlay">
          <div className="drag-overlay-content">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p>Drop your project folder here</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default FileUploader
