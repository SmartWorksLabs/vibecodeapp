/**
 * Service for saving projects to file system
 * Uses File System Access API when available, falls back to ZIP download with folder structure
 */

let projectsDirectoryHandle = null

/**
 * Check if File System Access API is supported
 */
export const isFileSystemAccessSupported = () => {
  return 'showDirectoryPicker' in window
}

/**
 * Request access to the Projects directory
 * Returns a directory handle if user grants permission
 * On first call, asks user to select a folder, then creates/accesses "Projects" subfolder
 */
export const requestProjectsDirectory = async () => {
  try {
    // Check if File System Access API is supported
    if (!isFileSystemAccessSupported()) {
      console.warn('File System Access API not supported in this browser')
      return null
    }
    
    console.log('File System Access API is supported, showing directory picker...')

    // If we already have a handle, verify it's still valid
    if (projectsDirectoryHandle) {
      try {
        // Try to access it to verify it's still valid
        await projectsDirectoryHandle.getDirectoryHandle('.', { create: false })
        return projectsDirectoryHandle
      } catch (error) {
        // Handle is no longer valid, clear it
        projectsDirectoryHandle = null
      }
    }

    // Request directory access - ask user to select a folder
    // They should select the folder where they want the "Projects" folder to be
    console.log('Calling showDirectoryPicker...')
    const handle = await window.showDirectoryPicker({
      mode: 'readwrite',
      startIn: 'desktop' // Start in user's Desktop folder
    })
    console.log('Directory picker returned handle:', handle)

    // Look for or create "Projects" folder in the selected directory
    let projectsHandle = null
    try {
      projectsHandle = await handle.getDirectoryHandle('Projects', { create: true })
    } catch (error) {
      console.error('Error accessing Projects folder:', error)
      return null
    }

    // Store the handle for future use in this session
    projectsDirectoryHandle = projectsHandle
    return projectsHandle
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('User cancelled directory picker')
    } else {
      console.error('Error requesting directory:', error)
    }
    return null
  }
}

/**
 * Save a project to the file system
 * @param {string} projectName - Name of the project
 * @param {Array} files - Array of file objects with {name, content, type, isImage, dataUrl}
 * @param {boolean} promptIfNeeded - If true, prompt for directory if not already granted. If false, only save if access already exists.
 */
export const saveProjectToFileSystem = async (projectName, files, promptIfNeeded = true) => {
  try {
    console.log('saveProjectToFileSystem called:', { projectName, filesCount: files.length, promptIfNeeded })
    
    let projectsDir = projectsDirectoryHandle

    // If we don't have a directory handle, request one (only if prompting is allowed)
    if (!projectsDir) {
      console.log('No directory handle, promptIfNeeded:', promptIfNeeded)
      if (promptIfNeeded) {
        console.log('Requesting directory access...')
        projectsDir = await requestProjectsDirectory()
        console.log('Directory access result:', projectsDir ? 'granted' : 'denied/cancelled')
        if (!projectsDir) {
          // User cancelled or API not available - use ZIP fallback
          if (isFileSystemAccessSupported()) {
            // User cancelled - don't fallback
            console.log('User cancelled directory picker, skipping file system save')
            return false
          } else {
            // API not supported - use ZIP fallback
            console.log('File System Access API not supported, using ZIP download fallback')
            return await downloadProjectAsZip(projectName, files)
          }
        }
      } else {
        // Don't prompt, just return silently
        console.log('No directory access and prompting disabled, skipping file system save')
        return false
      }
    } else {
      console.log('Using existing directory handle')
    }

    // Create or get project folder
    const projectFolderName = sanitizeFolderName(projectName)
    let projectFolder
    try {
      projectFolder = await projectsDir.getDirectoryHandle(projectFolderName, { create: true })
    } catch (error) {
      console.error('Error creating project folder:', error)
      return false
    }

    // Save each file to the project folder
    for (const file of files) {
      try {
        let fileContent = file.content

        // For images, convert dataUrl to blob if needed
        if (file.isImage && file.dataUrl) {
          if (file.dataUrl.startsWith('data:')) {
            // Convert data URL to blob
            const response = await fetch(file.dataUrl)
            const blob = await response.blob()
            fileContent = blob
          } else if (file.dataUrl.startsWith('blob:')) {
            // Handle blob URLs
            const response = await fetch(file.dataUrl)
            const blob = await response.blob()
            fileContent = blob
          } else {
            fileContent = file.dataUrl
          }
        }

        // Create file handle (overwrite if exists)
        const fileHandle = await projectFolder.getFileHandle(file.name, { create: true })
        const writable = await fileHandle.createWritable()

        // Write content
        if (fileContent instanceof Blob) {
          await writable.write(fileContent)
        } else if (typeof fileContent === 'string') {
          // For text content, write as string
          await writable.write(fileContent)
        } else {
          // Convert to string if needed
          await writable.write(String(fileContent))
        }

        await writable.close()
        console.log(`Saved file: ${file.name} to Projects/${projectFolderName}/`)
      } catch (error) {
        console.error(`Error saving file ${file.name}:`, error)
        // Continue with other files even if one fails
      }
    }

    const savedPath = `Projects/${sanitizeFolderName(projectName)}/`
    console.log(`✅ Project "${projectName}" saved to file system as regular folder: ${savedPath}`)
    console.log(`✅ Saved ${files.length} files to ${savedPath}`)
    return true
  } catch (error) {
    console.error('Error saving project to file system:', error)
    // Don't fallback to ZIP - just skip file system save
    // Projects are still saved to localStorage
    console.log('Skipping file system save due to error (project still saved to localStorage)')
    return false
  }
}

/**
 * Fallback: Download project as ZIP file with folder structure
 * This works in all browsers and creates a proper folder structure when extracted
 */
const downloadProjectAsZip = async (projectName, files) => {
  try {
    const JSZip = (await import('jszip')).default
    const { saveAs } = await import('file-saver')

    const zip = new JSZip()
    const sanitizedName = sanitizeFolderName(projectName)
    
    // Create a folder in the ZIP with the project name
    const projectFolder = zip.folder(sanitizedName)

    // Add all files to the project folder in the ZIP
    for (const file of files) {
      let content = file.content

      // For images with dataUrl, convert to blob
      if (file.isImage && file.dataUrl) {
        if (file.dataUrl.startsWith('data:')) {
          const response = await fetch(file.dataUrl)
          const blob = await response.blob()
          projectFolder.file(file.name, blob)
        } else if (file.dataUrl.startsWith('blob:')) {
          const response = await fetch(file.dataUrl)
          const blob = await response.blob()
          projectFolder.file(file.name, blob)
        } else {
          projectFolder.file(file.name, content)
        }
      } else {
        projectFolder.file(file.name, content)
      }
    }

    // Generate and download zip
    const blob = await zip.generateAsync({ 
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    })
    
    saveAs(blob, `${sanitizedName}.zip`)

    console.log(`Project "${projectName}" downloaded as ZIP with folder structure: ${sanitizedName}/`)
    
    // Show a helpful message
    setTimeout(() => {
      alert(`Project saved as "${sanitizedName}.zip"\n\nExtract this ZIP file to get a folder with all your project files.\n\nThe folder structure will be:\n${sanitizedName}/\n  ${files.map(f => f.name).join('\n  ')}`)
    }, 500)
    
    return true
  } catch (error) {
    console.error('Error downloading project as ZIP:', error)
    return false
  }
}

/**
 * Sanitize folder/file name to remove invalid characters
 */
const sanitizeFolderName = (name) => {
  return name
    .replace(/[<>:"/\\|?*]/g, '_') // Replace invalid chars with underscore
    .replace(/\s+/g, '_') // Replace spaces with underscore
    .substring(0, 100) // Limit length
}

/**
 * Check if we have persistent access to Projects directory
 */
export const hasProjectsDirectoryAccess = () => {
  return projectsDirectoryHandle !== null
}

/**
 * Clear stored directory handle (e.g., on logout)
 */
export const clearProjectsDirectoryAccess = () => {
  projectsDirectoryHandle = null
}

/**
 * Load all projects from the file system Projects folder
 * Returns array of project objects with {name, fileCount, path}
 * Only loads if directory access was already granted (won't prompt)
 */
export const loadProjectsFromFileSystem = async () => {
  try {
    // Check if File System Access API is supported
    if (!isFileSystemAccessSupported()) {
      console.log('File System Access API not supported, cannot load projects from file system')
      return []
    }

    // Only use existing directory handle - don't prompt (requires user gesture)
    const projectsDir = projectsDirectoryHandle
    if (!projectsDir) {
      console.log('No directory access yet - projects will appear after first save')
      return []
    }

    const projects = []
    
    // Iterate through all directories in Projects folder
    for await (const [name, handle] of projectsDir.entries()) {
      if (handle.kind === 'directory') {
        // Count files in this project folder
        let fileCount = 0
        try {
          for await (const [fileName, fileHandle] of handle.entries()) {
            if (fileHandle.kind === 'file') {
              fileCount++
            }
          }
        } catch (error) {
          console.error(`Error reading project folder ${name}:`, error)
        }

        projects.push({
          name: name,
          fileCount: fileCount,
          path: `Projects/${name}`,
          isFolder: true,
          lastOpened: new Date().toISOString() // Use current time as placeholder
        })
      }
    }

    console.log(`Loaded ${projects.length} projects from file system`)
    return projects
  } catch (error) {
    console.error('Error loading projects from file system:', error)
    return []
  }
}

/**
 * Load project files from file system
 * @param {string} projectName - Name of the project folder
 * @returns {Array} Array of file objects with {name, content, type, isImage, dataUrl}
 */
export const loadProjectFilesFromFileSystem = async (projectName) => {
  try {
    // Check if File System Access API is supported
    if (!isFileSystemAccessSupported()) {
      throw new Error('File System Access API not supported')
    }

    // If we don't have a directory handle, request one
    let projectsDir = projectsDirectoryHandle
    if (!projectsDir) {
      projectsDir = await requestProjectsDirectory()
      if (!projectsDir) {
        throw new Error('No directory access')
      }
    }

    // Get project folder
    const projectFolderName = sanitizeFolderName(projectName)
    const projectFolder = await projectsDir.getDirectoryHandle(projectFolderName, { create: false })

    const files = []

    // Read all files from the project folder
    for await (const [fileName, fileHandle] of projectFolder.entries()) {
      if (fileHandle.kind === 'file') {
        try {
          const file = await fileHandle.getFile()
          const extension = fileName.split('.').pop()?.toLowerCase() || ''
          const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension)
          
          let content
          let dataUrl = null

          if (isImage) {
            // For images, convert to data URL
            const arrayBuffer = await file.arrayBuffer()
            const blob = new Blob([arrayBuffer], { type: file.type })
            dataUrl = await new Promise((resolve, reject) => {
              const reader = new FileReader()
              reader.onload = () => resolve(reader.result)
              reader.onerror = reject
              reader.readAsDataURL(blob)
            })
            content = dataUrl
          } else {
            // For text files, read as text
            content = await file.text()
          }

          files.push({
            name: fileName,
            content: content,
            type: extension || 'txt',
            isImage: isImage,
            dataUrl: dataUrl,
            path: fileName
          })
        } catch (error) {
          console.error(`Error reading file ${fileName}:`, error)
        }
      }
    }

    console.log(`Loaded ${files.length} files from project "${projectName}"`)
    return files
  } catch (error) {
    console.error('Error loading project files from file system:', error)
    throw error
  }
}

