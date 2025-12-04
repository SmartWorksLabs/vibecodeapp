import { useState, useRef, useEffect, useCallback } from 'react'
import FileUploader from './components/FileUploader'
import PreviewPane from './components/PreviewPane'
import TabPanel from './components/TabPanel'
import AuthModal from './components/AuthModal'
import MenuBar from './components/MenuBar'
import { useAuth } from './contexts/AuthContext'
// Projects saved to user account (Supabase) - "All Projects" is the source of truth
import { saveProject, loadProject, saveProjectAsNew } from './services/projectService'
import './App.css'

// Helper function to convert camelCase to kebab-case for CSS properties
const camelToKebab = (str) => {
  return str.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)
}

function App() {
  // Removed render log to prevent console freezing
  const [projectFiles, setProjectFiles] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [selectedElement, setSelectedElement] = useState(null)
  const [currentPage, setCurrentPage] = useState('index') // Track current HTML page for page-specific CSS
  const [selectedPages, setSelectedPages] = useState([]) // Array of selected pages for CSS scope (empty = current page only)
  const [styleSourcePage, setStyleSourcePage] = useState(null) // Track which page styles were originally applied FROM
  const [appliedPropertiesMap, setAppliedPropertiesMap] = useState(new Map()) // Track which properties were applied to which pages: Map<pageId, Set<property>>
  const [isApplying, setIsApplying] = useState(false) // Flag to prevent auto-detect during apply operations
  const [isInspectorEnabled, setIsInspectorEnabled] = useState(() => {
    console.log('App: Initializing isInspectorEnabled state to: true')
    return true
  })
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [fontSize, setFontSize] = useState('medium') // small, medium, large
  const [gridOverlay, setGridOverlay] = useState('none') // none, small, medium, large, custom
  const [gridColor, setGridColor] = useState('blue') // blue, white, red, green, purple, orange
  const [showFileExtensions, setShowFileExtensions] = useState(true) // show file extensions in file tree
  const [lineNumbers, setLineNumbers] = useState(true) // show line numbers in code editor
  const [tabSize, setTabSize] = useState(2) // tab size in code editor (2, 4, or 8)
  const [pendingTextChanges, setPendingTextChanges] = useState(() => new Map())
  const [pendingCSSChanges, setPendingCSSChanges] = useState(() => new Map())
  const pendingTextChangesRef = useRef(pendingTextChanges)
  const pendingCSSChangesRef = useRef(pendingCSSChanges)
  const [isTextEditing, setIsTextEditing] = useState(false)
  const [saveStatus, setSaveStatus] = useState('saved') // 'saved', 'saving', 'unsaved'
  const [lastSaved, setLastSaved] = useState(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [currentProjectName, setCurrentProjectName] = useState(null)
  const [hasBeenSavedToAllProjects, setHasBeenSavedToAllProjects] = useState(false)
  const [isLoadedFromAllProjects, setIsLoadedFromAllProjects] = useState(false)
  const [showSavePrompt, setShowSavePrompt] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState(null) // 'welcome' | 'refresh' | null
  const [duplicateNameModal, setDuplicateNameModal] = useState(() => ({ show: false, projectName: '', onRename: null, onCancel: null }))
  const isSavingRef = useRef(false) // Prevent duplicate saves
  const lastSavedNameRef = useRef(null) // Track the last name we saved to prevent duplicate check
  
  const { user, loading: authLoading } = useAuth()

  // Debug state changes - REMOVED to prevent unnecessary re-renders
  // This useEffect was causing cascading re-renders
  // useEffect(() => {
  //   console.log('App.jsx: isInspectorEnabled state changed to:', isInspectorEnabled)
  // }, [isInspectorEnabled])

  // Show auth modal if user tries to save without being logged in
  useEffect(() => {
    if (saveStatus === 'unsaved' && pendingTextChanges.size > 0 && !user && !authLoading) {
      // Don't auto-show auth modal - let user decide when to authenticate
      // The save will just fail silently until they log in
    }
  }, [saveStatus, pendingTextChanges.size, user, authLoading])

  // Keep refs in sync with state
  useEffect(() => {
    pendingTextChangesRef.current = pendingTextChanges
  }, [pendingTextChanges])
  
  useEffect(() => {
    pendingCSSChangesRef.current = pendingCSSChanges
  }, [pendingCSSChanges])
  
  useEffect(() => {
    return () => {
      // Cleanup: apply any pending changes when component unmounts
      // Note: We can't call applyPendingTextChanges here because it's defined later
      // and would require it in deps, causing the effect to re-run. Instead,
      // the cleanup is handled elsewhere or we accept that pending changes
      // might not persist on unmount (which is acceptable for this use case)
      if (pendingTextChangesRef.current.size > 0) {
        console.log('Component unmounting - pending text changes will be lost')
      }
    };
  }, []) // Empty deps - only run on unmount
  const [previewKey, setPreviewKey] = useState(0)
  const previewPaneRef = useRef(null)
  const isInternalUpdateRef = useRef(false) // Track if update is from manual save to prevent reload loop

  // Helper function to find next available project name with (1), (2), etc.
  const findNextAvailableProjectName = useCallback(async (baseName, userId) => {
    const { listProjects } = await import('./services/projectService')
    // Get fresh list of all projects from database
    const allProjects = await listProjects(userId)
    
    // Only check active projects (not deleted ones)
    // deletedAt will be null/undefined/empty string for active projects, or a timestamp string for deleted ones
    const activeProjects = allProjects.filter(p => {
      // Check both camelCase and snake_case property names
      const deletedAt = p.deletedAt || p.deleted_at
      // A project is active if deletedAt is null, undefined, empty string, or falsy
      // A timestamp string (ISO date) means it's deleted
      const isDeleted = deletedAt && (
        deletedAt !== null && 
        deletedAt !== undefined && 
        deletedAt !== '' &&
        (typeof deletedAt === 'string' && deletedAt.length > 0 && !isNaN(Date.parse(deletedAt)))
      )
      return !isDeleted
    })
    
    const existingNames = new Set(activeProjects.map(p => p.name))
    
    if (!existingNames.has(baseName)) {
      return baseName
    }
    
    // Find the highest number already used
    const baseNamePattern = new RegExp(`^${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\((\\d+)\\)$`)
    const usedNumbers = new Set()
    
    existingNames.forEach(name => {
      if (name === baseName) {
        usedNumbers.add(0) // Base name counts as 0
      } else {
        const match = name.match(baseNamePattern)
        if (match) {
          usedNumbers.add(parseInt(match[1], 10))
        }
      }
    })
    
    // Find the next available number
    let counter = 1
    while (usedNumbers.has(counter)) {
      counter++
    }
    
    const newName = `${baseName} (${counter})`
    return newName
  }, [])

  // Save project to "All Projects" (user account/Supabase) - this is the source of truth
  const saveProjectToAllProjects = useCallback(async (files, projectName, allowDuplicates = false) => {
    if (!files || files.length === 0 || !projectName) {
      return { success: false, projectId: null }
    }
    
    if (!user) {
      console.warn('Cannot save to All Projects - user not logged in')
      return { success: false, projectId: null }
    }
    
    // Prevent duplicate saves
    if (isSavingRef.current) {
      return { success: false, projectId: null, error: 'Save already in progress' }
    }
    
    isSavingRef.current = true
    
    try {
      let finalProjectName = projectName
      let wasRenamedInThisSave = false
      
      // Only check for duplicates if allowDuplicates is false
      // Skip duplicate check if we're in the middle of saving (isSavingRef prevents this, but double-check)
      if (!allowDuplicates) {
        // Check if project name already exists in All Projects
        // Get fresh list from database to ensure we have the latest projects
        const { listProjects } = await import('./services/projectService')
        const allProjects = await listProjects(user.id)
        
        // Also check recently deleted projects from localStorage as a fallback
        // This ensures we don't count projects that are in "Recently Deleted" even if deleted_at isn't set in DB
        let deletedProjectIds = new Set()
        try {
          const deletedStored = localStorage.getItem('vibecanvas_recently_deleted_projects')
          if (deletedStored) {
            const deletedData = JSON.parse(deletedStored)
            if (Array.isArray(deletedData)) {
              deletedData.forEach(deleted => {
                if (deleted.projectId) {
                  deletedProjectIds.add(deleted.projectId)
                }
              })
            }
          }
        } catch (e) {
          console.error('Error reading recently deleted from localStorage:', e)
        }
        
        // Only check active projects (not deleted ones)
        // deletedAt will be null/undefined/empty string for active projects, or a timestamp string for deleted ones
        const activeProjects = allProjects.filter(p => {
          // Check both camelCase and snake_case property names (Supabase converts to camelCase, but be safe)
          const deletedAt = p.deletedAt || p.deleted_at
          
          // A project is deleted if:
          // 1. It has a valid deletedAt timestamp (ISO date string)
          // 2. OR its projectId is in the recently deleted list from localStorage
          const hasDeletedTimestamp = deletedAt && (
            deletedAt !== null && 
            deletedAt !== undefined && 
            deletedAt !== '' &&
            (typeof deletedAt === 'string' && deletedAt.length > 0 && !isNaN(Date.parse(deletedAt)))
          )
          const isInDeletedList = p.id && deletedProjectIds.has(p.id)
          const isDeleted = hasDeletedTimestamp || isInDeletedList
          const isActive = !isDeleted
          
          return isActive
        })
        
        // Skip duplicate check if we just saved this exact name (prevents modal from appearing twice)
        if (lastSavedNameRef.current === projectName) {
          // Clear the ref so it doesn't skip on future saves
          lastSavedNameRef.current = null
        }
        
        // Find active project with matching name (with final safety check)
        const existingProject = activeProjects.find(p => {
          if (p.name !== projectName) return false
          
          // Final safety check: double-verify this project is actually active
          const pDeletedAt = p.deletedAt || p.deleted_at
          const pHasDeletedTimestamp = pDeletedAt && (
            pDeletedAt !== null && 
            pDeletedAt !== undefined && 
            pDeletedAt !== '' &&
            (typeof pDeletedAt === 'string' && pDeletedAt.length > 0 && !isNaN(Date.parse(pDeletedAt)))
          )
          const pIsInDeletedList = p.id && deletedProjectIds.has(p.id)
          
          const isActuallyActive = !pHasDeletedTimestamp && !pIsInDeletedList
          
          return isActuallyActive
        })
        
        if (existingProject && lastSavedNameRef.current !== projectName) {
          // Project with same name exists - force user to rename
          // Don't clear pendingNavigation - we need to preserve it for after the save
          // Just hide the save prompt while showing duplicate name modal
          setShowSavePrompt(false)
          
          const userChoice = await new Promise((resolve) => {
            const handleRename = (newName) => {
              const trimmedName = newName.trim()
              if (!trimmedName || trimmedName === '' || trimmedName === projectName) {
                // Invalid name - don't close modal, just return
                return
              }
              // Check if the new name also exists
              const newNameExists = activeProjects.find(p => p.name === trimmedName)
              if (newNameExists) {
                alert(`A project named "${trimmedName}" already exists. Please choose a different name.`)
                return
              }
              setDuplicateNameModal({ show: false, projectName: '', onRename: null, onCancel: null })
              resolve({ action: 'rename', name: trimmedName })
            }
            
            const handleCancel = () => {
              setDuplicateNameModal({ show: false, projectName: '', onRename: null, onCancel: null })
              resolve({ action: 'cancel' })
            }
            
            setDuplicateNameModal({
              show: true,
              projectName: projectName,
              onRename: handleRename,
              onCancel: handleCancel
            })
          })
          
          if (userChoice.action === 'cancel') {
            // User cancelled - abort save
            isSavingRef.current = false
            return { success: false, projectId: null, error: 'Save cancelled by user' }
          }
          
          if (userChoice.action === 'rename') {
            finalProjectName = userChoice.name || projectName
            wasRenamedInThisSave = finalProjectName !== projectName
            // Re-check if the new name exists (in case it was added between the check and now)
            const { listProjects: recheckListProjects } = await import('./services/projectService')
            const recheckProjects = await recheckListProjects(user.id)
            
            // Also check recently deleted projects from localStorage
            let recheckDeletedIds = new Set()
            try {
              const deletedStored = localStorage.getItem('vibecanvas_recently_deleted_projects')
              if (deletedStored) {
                const deletedData = JSON.parse(deletedStored)
                if (Array.isArray(deletedData)) {
                  deletedData.forEach(deleted => {
                    if (deleted.projectId) {
                      recheckDeletedIds.add(deleted.projectId)
                    }
                  })
                }
              }
            } catch (e) {
              // Ignore errors
            }
            
            const recheckActiveProjects = recheckProjects.filter(p => {
              // Check both camelCase and snake_case property names
              const deletedAt = p.deletedAt || p.deleted_at
              // A project is deleted if it has a valid deletedAt timestamp OR is in deleted list
              const hasDeletedTimestamp = deletedAt && (
                deletedAt !== null && 
                deletedAt !== undefined && 
                deletedAt !== '' &&
                (typeof deletedAt === 'string' && deletedAt.length > 0 && !isNaN(Date.parse(deletedAt)))
              )
              const isInDeletedList = p.id && recheckDeletedIds.has(p.id)
              return !hasDeletedTimestamp && !isInDeletedList
            })
            const recheckExists = recheckActiveProjects.find(p => p.name === finalProjectName)
            if (recheckExists) {
              // The new name also exists - show error and abort
              alert(`A project named "${finalProjectName}" already exists. Please choose a different name.`)
              isSavingRef.current = false
              return { success: false, projectId: null, error: 'New name also exists' }
            }
            // Mark that we've already checked for duplicates with this name
            // This prevents the duplicate check from running again after we save
            lastSavedNameRef.current = finalProjectName
            // Don't update currentProjectName here - let the caller update it after save completes
            // This prevents triggering another save with the new name
          } else {
            // Should not happen, but fallback
            isSavingRef.current = false
            return { success: false, projectId: null, error: 'Invalid user choice' }
          }
        }
      }
      
      // Save to Supabase (user's account)
      // Include image dataUrls in content
      const filesForCloud = files.map(file => ({
        name: file.name,
        content: file.isImage && file.dataUrl ? file.dataUrl : file.content,
        type: file.type || file.name.split('.').pop(),
      }))
      
      // Always create a new project (don't update existing)
      const { saveProjectAsNew: saveAsNew } = await import('./services/projectService')
      const result = await saveAsNew(finalProjectName, filesForCloud, user.id)
      console.log('✅ Saved project to All Projects (user account):', finalProjectName, 'with', files.length, 'files', 'Project ID:', result.projectId)
      setHasBeenSavedToAllProjects(true)
      
      // Track the name we just saved to prevent duplicate check on immediate re-save
      lastSavedNameRef.current = finalProjectName
      // Clear it after a short delay to allow normal duplicate checking on future saves
      setTimeout(() => {
        lastSavedNameRef.current = null
      }, 1000)
      
      // Don't remove from recently deleted list - let user manually restore if they want
      // Projects can exist in both All Projects and Recently Deleted simultaneously
      // But when saved, deleted_at is cleared, so it will appear in All Projects
      
      // Return the final project name (which may have been renamed)
      // Include wasRenamed flag so caller knows not to check for duplicates again
      return { success: true, projectId: result.projectId, projectName: finalProjectName, wasRenamed: wasRenamedInThisSave }
    } catch (error) {
      console.error('❌ Error saving project to All Projects:', error)
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      })
      alert(`Failed to save project: ${error.message || 'Unknown error'}`)
      return { success: false, projectId: null, error }
    } finally {
      isSavingRef.current = false
    }
  }, [user])

  const handleProjectLoad = async (files, fromAllProjects = false, defaultProjectName = null) => {
    setProjectFiles(files)
    // Auto-select index.html if available
    const indexHtml = files.find(f => f.name === 'index.html')
    if (indexHtml) {
      setSelectedFile(indexHtml)
      // Update currentPage to match the selected file
      const pageId = indexHtml.name.replace('.html', '').replace(/[^a-zA-Z0-9]/g, '-')
      setCurrentPage(pageId)
      console.log('Current page set on project load to:', pageId)
    } else {
      // If no index.html, select the first HTML file and update currentPage
      const firstHtml = files.find(f => f.name.endsWith('.html'))
      if (firstHtml) {
        setSelectedFile(firstHtml)
        const pageId = firstHtml.name.replace('.html', '').replace(/[^a-zA-Z0-9]/g, '-')
        setCurrentPage(pageId)
        console.log('Current page set on project load to:', pageId)
      }
    }
    
    // Set default project name if not set
    let projectName = currentProjectName
    if (!projectName) {
      // Use provided default name (folder name), or extract from first HTML file, or use default
      if (defaultProjectName) {
        projectName = defaultProjectName
      } else {
        const firstHtml = files.find(f => f.name.endsWith('.html'))
        projectName = firstHtml ? firstHtml.name.replace('.html', '') : 'Untitled Project'
      }
      setCurrentProjectName(projectName)
    }
    
    // Track if project was loaded from All Projects (already saved)
    setIsLoadedFromAllProjects(fromAllProjects)
    // If loaded from All Projects, it's already saved; otherwise, mark as unsaved
    setHasBeenSavedToAllProjects(fromAllProjects)
    
    // Don't save on load - only save when user manually presses "Save"
  }

  const handleFileUpdate = (fileName, newContent) => {
    setProjectFiles(prev => 
      prev.map(file => 
        file.name === fileName 
          ? { ...file, content: newContent }
          : file
      )
    )
    // DON'T force preview refresh on file updates - causes scroll to top
    // setPreviewKey(prev => prev + 1)
  }

  const handleElementSelect = (element, inspectorState = null) => {
    // Don't apply pending changes when just switching elements in the same file
    // Text changes will persist in the preview and be saved when navigating away from the file
    
    // Clear text editing state when switching elements
    setIsTextEditing(false);
    
    setSelectedElement(element)
    
    // ⭐ Always run detection when element is selected (unless during apply operations)
    // This ensures checkboxes are updated correctly, especially after page switches
    // Detection will find which pages have styles applied and update checkboxes accordingly
    if (element && projectFiles && !isApplying) {
      setTimeout(() => {
        const appliedPages = detectAppliedPages(element, currentPage)
        console.log('🔍 Detection in handleElementSelect (raw):', appliedPages)
        
        // Normalize page names to match availablePages format (remove .html, normalize)
        // availablePages uses: f.name.replace('.html', '').replace(/[^a-zA-Z0-9]/g, '-')
        const normalizedAppliedPages = appliedPages.map(pageName => {
          return pageName.replace('.html', '').replace(/[^a-zA-Z0-9]/g, '-')
        })
        
        console.log('🔍 Detection in handleElementSelect (normalized):', normalizedAppliedPages)
        console.log('✅ Updating selectedPages to:', normalizedAppliedPages)
        setSelectedPages(normalizedAppliedPages)
      }, 50) // Small delay to ensure state is updated
    }
    
    // Update inspector state ONLY if explicitly provided (not undefined)
    if (inspectorState !== null && inspectorState !== undefined) {
      setIsInspectorEnabled(inspectorState)
    }
  }

  // Debounce ref for inspector toggle
  const inspectorToggleDebounceRef = useRef(null)

  // Separate handler for inspector toggle to avoid confusion
  const handleInspectorToggle = (newInspectorState) => {
    // Clear any pending toggle
    if (inspectorToggleDebounceRef.current) {
      clearTimeout(inspectorToggleDebounceRef.current)
    }
    
    // Debounce rapid toggles (50ms)
    inspectorToggleDebounceRef.current = setTimeout(() => {
    setIsInspectorEnabled(newInspectorState)
      
      // Clear selection and text editing when turning off inspector
    if (!newInspectorState) {
      setSelectedElement(null)
        setIsTextEditing(false)
    }
      
      inspectorToggleDebounceRef.current = null
    }, 50)
  }

  const handleSettingsToggle = () => {
    setIsSettingsOpen(!isSettingsOpen)
  }

  const handleFontSizeChange = (newFontSize) => {
    setFontSize(newFontSize)
  }

  const handleGridOverlayChange = (newGridOverlay) => {
    setGridOverlay(newGridOverlay)
  }

  const handleGridColorChange = (newGridColor) => {
    setGridColor(newGridColor)
  }

  const handleShowFileExtensionsChange = (show) => {
    setShowFileExtensions(show)
  }

  const handleLineNumbersChange = (show) => {
    setLineNumbers(show)
  }

  const handleTabSizeChange = (size) => {
    setTabSize(parseInt(size))
  }

  const handlePropertyChange = (property, value, childElement = null) => {
    if (!selectedElement || !previewPaneRef.current) {
      console.warn('Cannot update property - missing selectedElement or previewPaneRef');
      return;
    }

    // Handle child text content updates
    if (property === 'childTextContent') {
      previewPaneRef.current.updateElementStyle('childTextContent', value, childElement);
      return;
    }

    // Handle text content separately (update HTML)
    if (property === 'textContent') {
      setIsTextEditing(true); // Mark that text editing is active
      updateHTMLTextContent(value);
      return;
    }

    // Update preview immediately via postMessage (don't reload iframe)
    previewPaneRef.current.updateElementStyle(property, value);

    // Store CSS change for later persistence (don't update file immediately to avoid reload)
    storePendingCSSChange(property, value);
  }

  const updateHTMLTextContent = (newText) => {
    // Update the preview immediately via postMessage
    if (previewPaneRef.current) {
      previewPaneRef.current.updateElementStyle('textContent', newText);
    } else {
      console.error('previewPaneRef.current is not available!');
    }
    
    // Store the text change for later persistence (don't update file immediately to avoid reload)
    if (selectedElement && selectedFile) {
      const elementKey = `${selectedFile.name}_${selectedElement.tagName}_${selectedElement.id || selectedElement.className || selectedElement.textContent}`;
      setPendingTextChanges(prev => new Map(prev.set(elementKey, {
        fileName: selectedFile.name,
        element: selectedElement,
        newText: newText,
        originalText: selectedElement.textContent
      })));
      
      // Set unsaved status when changes are made
      setSaveStatus('unsaved');
    }
  }

  const updateHTMLFile = (newText, element = selectedElement, fileName = selectedFile?.name) => {
    const targetElement = element || selectedElement;
    const targetFile = fileName ? projectFiles?.find(f => f.name === fileName) : selectedFile;
    
    if (!targetElement || !targetFile) {
      console.error('Missing element or file!', {
        hasElement: !!targetElement,
        hasFile: !!targetFile
      });
      return;
    }
    
    if (targetFile.type !== 'html') {
      console.warn('File is not HTML:', targetFile.type);
      return;
    }

    // Extract element properties
    const elementTag = targetElement.tagName ? targetElement.tagName.toLowerCase() : null;
    const elementId = targetElement.id || null;
    const elementClass = targetElement.className ? (typeof targetElement.className === 'string' ? targetElement.className : targetElement.className.baseVal || '') : null;
    const originalText = targetElement.textContent || targetElement.innerText || '';
    const hasChildren = targetElement.children && targetElement.children.length > 0;

    let htmlContent = targetFile.content;
    
    if (!htmlContent) {
      console.error('HTML content is empty or undefined!');
      return;
    }

    // Ensure newText is a string
    if (typeof newText !== 'string') {
      newText = String(newText);
    }

    // Strategy 1: If element has an ID, find it specifically
    if (elementId) {
      // Match opening tag with ID, handle both with and without nested children
      const escapedId = elementId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      if (!hasChildren) {
        // No children - simple text replacement
        const idRegex = new RegExp(`(<${elementTag}[^>]*id=["']${escapedId}["'][^>]*>)([^<]*?)(</${elementTag}>)`, 'gis');
        const match = htmlContent.match(idRegex);
        if (match) {
          htmlContent = htmlContent.replace(idRegex, `$1${newText}$3`);
          
          // Validate HTML content after replacement
          if (!htmlContent || htmlContent.trim().length === 0) {
            console.error('HTML content became empty after replacement!');
            return;
          }
          
          handleFileUpdate(targetFile.name, htmlContent);
          return;
        }
      } else {
        // Has children - need to preserve structure, only update direct text nodes
        // Match the opening tag and try to find text immediately after it (before first child tag)
        const idRegexWithText = new RegExp(`(<${elementTag}[^>]*id=["']${escapedId}["'][^>]*>)([^<]+?)(<)`, 'gis');
        const matchWithText = htmlContent.match(idRegexWithText);
        if (matchWithText && matchWithText[2].trim() === originalText.trim()) {
          htmlContent = htmlContent.replace(idRegexWithText, `$1${newText}$3`);
          
          // Validate HTML content after replacement
          if (!htmlContent || htmlContent.trim().length === 0) {
            console.error('HTML content became empty after replacement!');
            return;
          }
          
          handleFileUpdate(targetFile.name, htmlContent);
          return;
        }
      }
    }

    // Strategy 2: If element has a class, try to find it
    if (elementClass) {
      const firstClass = elementClass.split(' ')[0];
      const escapedClass = firstClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      if (!hasChildren) {
        // No children - simple text replacement
        const classRegex = new RegExp(`(<${elementTag}[^>]*class=["'][^"']*${escapedClass}[^"']*["'][^>]*>)([^<]*?)(</${elementTag}>)`, 'gis');
        const match = htmlContent.match(classRegex);
        if (match) {
          htmlContent = htmlContent.replace(classRegex, `$1${newText}$3`);
          
          // Validate HTML content after replacement
          if (!htmlContent || htmlContent.trim().length === 0) {
            console.error('HTML content became empty after replacement!');
            return;
          }
          
          handleFileUpdate(targetFile.name, htmlContent);
          return;
        }
      } else {
        // Has children - preserve structure
        const classRegexWithText = new RegExp(`(<${elementTag}[^>]*class=["'][^"']*${escapedClass}[^"']*["'][^>]*>)([^<]+?)(<)`, 'gis');
        const matchWithText = htmlContent.match(classRegexWithText);
        if (matchWithText && matchWithText[2].trim() === originalText.trim()) {
          htmlContent = htmlContent.replace(classRegexWithText, `$1${newText}$3`);
          
          // Validate HTML content after replacement
          if (!htmlContent || htmlContent.trim().length === 0) {
            console.error('HTML content became empty after replacement!');
            return;
          }
          
          handleFileUpdate(targetFile.name, htmlContent);
          return;
        }
      }
    }

    // Strategy 3: Text-based replacement (most fallback, least reliable)
    if (originalText && originalText.trim().length > 0) {
      // Escape special regex characters in the original text
      const escapedOriginalText = originalText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Try to match text between tags (more flexible pattern)
      const textRegex = new RegExp(`(>\\s*)${escapedOriginalText}(\\s*<)`, 'gs');
      const match = htmlContent.match(textRegex);
      if (match) {
        htmlContent = htmlContent.replace(textRegex, `$1${newText}$2`);
        
        // Validate HTML content after replacement
        if (!htmlContent || htmlContent.trim().length === 0) {
          console.error('HTML content became empty after replacement!');
          return;
        }
        
        handleFileUpdate(targetFile.name, htmlContent);
        return;
      }
    }

    console.error('Failed to find element in HTML. Element details:', {
      tag: elementTag,
      id: elementId,
      class: elementClass,
      originalText: originalText?.substring(0, 50),
      htmlPreview: htmlContent?.substring(0, 500)
    });
  }

  // Manual save function that persists changes and saves to All Projects
  const handleManualSave = useCallback(async (overrideFilesOrEvent = null) => {
    // Handle button click events: if first param is a React event, ignore it and use state
    let overrideFiles = null
    if (overrideFilesOrEvent) {
      // Check if it's a React event (has nativeEvent or target property)
      if (overrideFilesOrEvent.nativeEvent || overrideFilesOrEvent.target) {
        console.log('🔘 Save button clicked - using projectFiles from state')
        overrideFiles = null // Use projectFiles from state instead
      } else {
        // It's a files array passed programmatically
        overrideFiles = overrideFilesOrEvent
      }
    }
    
    if (!projectFiles && !overrideFiles) {
      console.warn('Cannot save - no project files');
      return;
    }
    
    if (!user) {
      console.warn('Cannot save - user not logged in');
      setShowAuthModal(true);
      return;
    }
    
    // Clear any pending navigation and save prompt when saving manually
    setPendingNavigation(null)
    setShowSavePrompt(false)
    setSaveStatus('saving');
    
    try {
      // Mark as internal update to prevent reload loop
      isInternalUpdateRef.current = true;
      
      // Build updated files array with pending changes applied BEFORE saving
      // This ensures we save the latest changes without relying on async state updates
      // IMPORTANT: Don't update state here - just build the files to save
      // The UI already shows the changes (they're in the iframe), so we don't want to touch state
      // Use overrideFiles if provided (for direct CSS updates), otherwise use projectFiles
      let filesToSave = overrideFiles || projectFiles
      
      // Safety check: Ensure we have valid files to save
      if (!filesToSave || !Array.isArray(filesToSave)) {
        console.error('❌ Cannot save: filesToSave is not an array', { filesToSave, overrideFiles, projectFiles })
        setSaveStatus('unsaved')
        isInternalUpdateRef.current = false
        alert('Cannot save: Project files are not available. Please reload the project and try again.')
        return
      }
      
      // Apply pending CSS changes first
      // Skip if overrideFiles is provided (those files already have the changes we want)
      // Use ref to get latest value (state might be stale in closure)
      const latestPendingCSSChanges = pendingCSSChangesRef.current
      if (latestPendingCSSChanges.size > 0 && !overrideFiles) {
        
        const cssFiles = filesToSave.filter(f => f.name.endsWith('.css'))
        if (cssFiles.length > 0) {
          // Group changes by file
          const changesByFile = new Map()
          latestPendingCSSChanges.forEach((change) => {
            if (!changesByFile.has(change.fileName)) {
              changesByFile.set(change.fileName, [])
            }
            changesByFile.get(change.fileName).push(change)
          })

          // Apply changes to each CSS file
          filesToSave = filesToSave.map(file => {
            const changes = changesByFile.get(file.name)
            if (!changes || !file.name.endsWith('.css')) return file

            let cssContent = file.content

            // Group changes by selector
            const changesBySelector = new Map()
            changes.forEach(change => {
              if (!changesBySelector.has(change.selector)) {
                changesBySelector.set(change.selector, [])
              }
              changesBySelector.get(change.selector).push(change)
            })

            // Apply all changes for each selector
            changesBySelector.forEach((selectorChanges, selector) => {
              // Convert property names to CSS properties (camelCase to kebab-case)
              const cssProperties = selectorChanges.map(change => {
                // Log the original property before conversion to debug property mix-ups
                console.log('🔄 Converting property:', {
                  original: change.property,
                  value: change.value,
                  selector: selector
                })
                
                // Convert camelCase to kebab-case for all CSS properties
                const cssProperty = camelToKebab(change.property)
                
                // Verify conversion is correct
                if (change.property === 'color' && cssProperty !== 'color') {
                  console.error('❌ PROPERTY CONVERSION ERROR: color ->', cssProperty)
                }
                if (change.property === 'backgroundColor' && cssProperty !== 'background-color') {
                  console.error('❌ PROPERTY CONVERSION ERROR: backgroundColor ->', cssProperty)
                }
                
                return { property: cssProperty, value: change.value }
              })

              // Check if selector already exists in CSS
              // Escape special regex characters but handle multiple classes properly
              const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
              // Match selector with optional whitespace before the opening brace
              const selectorRegex = new RegExp(`(${escapedSelector})\\s*\\{[^}]*\\}`, 'g')
              const existingRule = cssContent.match(selectorRegex)
              
              console.log('🟢 CSS Save Debug (Manual Save):', {
                selector: selector,
                escapedSelector: escapedSelector,
                existingRule: existingRule ? existingRule[0].substring(0, 200) : null,
                properties: cssProperties.map(p => `${p.property}: ${p.value}`),
                exactValues: cssProperties.map(p => p.value)
              })
              console.log('🟢 CSS Save Debug - EXACT VALUES BEING WRITTEN:', cssProperties.map(p => `${p.property}="${p.value}"`).join(', '))
              
              // Special logging for color properties
              const colorProps = cssProperties.filter(p => p.property === 'color' || p.property === 'background-color')
              if (colorProps.length > 0) {
                console.log('🎨 COLOR PROPERTIES BEING SAVED TO CSS:', colorProps.map(p => `${p.property}="${p.value}"`).join(', '))
              }

              if (existingRule) {
                // Update existing rule - only replace the first match
                const beforeUpdate = cssContent.substring(0, 500)
                const firstMatch = existingRule[0]
                const updatedRule = firstMatch.replace(
                  /(\{[^}]*)/,
                  (match) => {
                    let updated = match
                    console.log('🔍 Before property removal:', updated.substring(0, 200))
                    
                    // Remove existing properties if they exist (case-insensitive to catch variations)
                    cssProperties.forEach(({ property, value }) => {
                      const escapedProp = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                      // Match property name case-insensitively, but preserve the exact value we're setting
                      // CRITICAL FIX: Prevent matching "color" inside "background-color"
                      // Match property name only when:
                      // 1. At start of line OR after whitespace/newline (not after a hyphen)
                      // 2. Followed by colon (not hyphen or other character)
                      // This ensures "color" doesn't match inside "background-color"
                      const propRegex = new RegExp(`(^|[\\s\\n])${escapedProp}(?!-)\\s*:\\s*[^;]+;?`, 'gim')
                      const beforeReplace = updated
                      updated = updated.replace(propRegex, '$1') // Replace with captured boundary (preserves whitespace/newline)
                      if (beforeReplace !== updated) {
                        console.log(`✅ Removed existing ${property} property`)
                      }
                    })
                    
                    // CRITICAL FIX: If we're adding "color", also remove "background-color" entirely
                    // This prevents "background-color" from being partially removed leaving "background-"
                    cssProperties.forEach(({ property, value }) => {
                      if (property === 'color') {
                        // Remove any "background-color" property entirely
                        const bgColorRegex = /background-color\s*:\s*[^;]+;?/gi
                        updated = updated.replace(bgColorRegex, '')
                        console.log('✅ Removed background-color property (replacing with color)')
                      }
                    })
                    
                    // CRITICAL FIX: Clean up any orphaned "background-" text left behind
                    // This can happen if "background-color" was partially removed
                    // Remove any standalone "background-" followed by whitespace/newlines
                    updated = updated.replace(/background-\s*\n\s*/g, '')
                    updated = updated.replace(/background-\s+/g, '')
                    
                    console.log('🔍 After property removal:', updated.substring(0, 200))
                    
              // Add new properties with EXACT values (preserve user's exact input)
              // Use !important to ensure our rules override existing ones
              cssProperties.forEach(({ property, value }) => {
                // Log each property being added to verify it's correct
                console.log('➕ Adding CSS property to rule:', {
                  property: property,
                  value: value,
                  selector: selector
                })
                updated += `\n  ${property}: ${value} !important;`
              })
              
              console.log('🔍 After adding properties:', updated.substring(0, 300))
                    return updated
                  }
                )
                // Replace only the first occurrence by removing the global flag temporarily
                const nonGlobalRegex = new RegExp(`(${escapedSelector})\\s*\\{[^}]*\\}`, '')
                cssContent = cssContent.replace(nonGlobalRegex, updatedRule)
                
                // Check for duplicate rules and remove them, keeping only the updated one (which has all properties)
                const duplicateRuleRegex = new RegExp(`${escapedSelector}\\s*\\{[^}]*\\}`, 'g')
                const duplicateMatches = cssContent.match(duplicateRuleRegex)
                
                if (duplicateMatches && duplicateMatches.length > 1) {
                  console.log(`⚠️ Found ${duplicateMatches.length} duplicate rules for ${selector}`)
                  console.log('⚠️ Duplicate rules found:', duplicateMatches.map((r, i) => `Rule ${i + 1}: ${r.substring(0, 200)}`))
                  
                  // The updatedRule already contains all properties from the original rule plus our changes
                  // Remove ALL occurrences (including the one we just updated)
                  cssContent = cssContent.replace(duplicateRuleRegex, '')
                  
                  // Add back ONLY the updated rule (which preserves all original properties + our color change)
                  cssContent += updatedRule
                  
                  console.log('✅ Removed duplicates and kept updated rule with all properties:', updatedRule.substring(0, 200))
                }
                
                const afterUpdate = cssContent.substring(0, 500)
                console.log('🟡 Updated CSS rule:', {
                  selector: selector,
                  before: beforeUpdate,
                  after: afterUpdate,
                  updatedRule: updatedRule.substring(0, 200)
                })
                console.log('🟡 Updated CSS rule - EXACT VALUES:', cssProperties.map(p => `${p.property}="${p.value}"`).join(', '))
                console.log('🟡 Full updated rule:', updatedRule)
                
                // Debug: Check for conflicting color rules after update
                const colorProps = cssProperties.filter(p => p.property === 'color')
                if (colorProps.length > 0) {
                  const savedColor = colorProps[0].value
                  console.log('🔍 Searching for conflicting color rules after CSS update...')
                  
                  // Check for the old color value (rgb(17, 24, 39) = #111827)
                  const oldColorPatterns = [
                    '#111827',
                    'rgb(17, 24, 39)',
                    'rgb(17,24,39)'
                  ]
                  const allConflictingRules = []
                  oldColorPatterns.forEach(oldColor => {
                    const regex = new RegExp(`${escapedSelector.replace(/\\/g, '\\\\')}[^{]*\\{[^}]*color\\s*:\\s*${oldColor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^}]*\\}`, 'gi')
                    const matches = cssContent.match(regex)
                    if (matches) {
                      allConflictingRules.push(...matches)
                    }
                  })
                  
                  // Also check for all .section-title color rules - find ALL complete rule blocks
                  const allSectionTitleCompleteRules = cssContent.match(/\.section-title\s*\{[^}]+\}/g) || []
                  const allSectionTitleColorRules = cssContent.match(/\.section-title[^{]*\{[^}]*color[^}]*\}/gi) || []
                  
                  // Extract actual color values from the rules
                  const colorValuesInRules = allSectionTitleColorRules.map(rule => {
                    const colorMatch = rule.match(/color\s*:\s*([^;!]+)/i)
                    const hasImportant = rule.includes('!important')
                    return {
                      color: colorMatch ? colorMatch[1].trim() : null,
                      hasImportant: hasImportant,
                      fullRule: rule
                    }
                  }).filter(r => r.color)
                  
                  console.log('🔍 CSS Debug After Update:', {
                    selector: selector,
                    savedColor: savedColor,
                    savedColorInCSS: cssContent.includes(savedColor) ? 'YES ✓' : 'NO ✗',
                    importantInRule: updatedRule.includes('!important') ? 'YES ✓' : 'NO ✗',
                    conflictingRulesCount: allConflictingRules.length,
                    conflictingRules: allConflictingRules.map(r => r),
                    allSectionTitleCompleteRules: allSectionTitleCompleteRules.length,
                    allSectionTitleCompleteRulesFull: allSectionTitleCompleteRules,
                    allSectionTitleColorRules: allSectionTitleColorRules.length,
                    colorValuesFound: colorValuesInRules,
                    cssPreview: cssContent.includes(selector) ? cssContent.substring(cssContent.indexOf(selector), cssContent.indexOf(selector) + 500) : 'Selector not found in CSS'
                  })
                }
              } else {
                // Add new rule with EXACT values
                // Use !important to ensure our rules override existing ones
                const properties = cssProperties.map(({ property, value }) => `  ${property}: ${value} !important;`).join('\n')
                const newRule = `\n${selector} {\n${properties}\n}\n`
                cssContent += newRule
                console.log('🟢 Added new CSS rule:', {
                  selector: selector,
                  rule: newRule,
                  values: cssProperties.map(p => p.value)
                })
                console.log('🟢 Added new CSS rule - EXACT VALUES:', cssProperties.map(p => `${p.property}="${p.value}"`).join(', '))
                console.log('🟢 Full new rule:', newRule)
              }
            })

            return {
              ...file,
              content: cssContent
            }
          })
        }
      }
      
      // Apply pending text changes directly to the files array (don't update state - causes UI revert)
      if (pendingTextChanges.size > 0) {
        filesToSave = projectFiles.map(file => {
          // Check if this file has pending changes
          const fileChanges = Array.from(pendingTextChanges.values()).filter(
            change => change.fileName === file.name
          )
          
          if (fileChanges.length > 0 && file.type === 'html') {
            // Apply all changes for this file using the same logic as updateHTMLFile
            let updatedContent = file.content
            fileChanges.forEach(change => {
              // Find and replace the element's text in the HTML content
              const element = change.element
              if (element && updatedContent) {
                const elementTag = element.tagName?.toLowerCase()
                const elementId = element.id || null
                const elementClass = element.className ? 
                  (typeof element.className === 'string' ? element.className : element.className.baseVal || '') : 
                  null
                const originalText = element.textContent || element.innerText || ''
                const hasChildren = element.children && element.children.length > 0
                
                // Use the same replacement logic as updateHTMLFile
                if (elementId) {
                  const escapedId = elementId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                  if (!hasChildren) {
                    const idRegex = new RegExp(`(<${elementTag}[^>]*id=["']${escapedId}["'][^>]*>)([^<]*?)(</${elementTag}>)`, 'gis')
                    if (idRegex.test(updatedContent)) {
                      updatedContent = updatedContent.replace(idRegex, `$1${change.newText}$3`)
                    }
                  } else {
                    const idRegexWithText = new RegExp(`(<${elementTag}[^>]*id=["']${escapedId}["'][^>]*>)([^<]+?)(<)`, 'gis')
                    if (idRegexWithText.test(updatedContent)) {
                      updatedContent = updatedContent.replace(idRegexWithText, `$1${change.newText}$3`)
                    }
                  }
                } else if (elementClass) {
                  const firstClass = elementClass.split(' ')[0]
                  const escapedClass = firstClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                  if (!hasChildren) {
                    const classRegex = new RegExp(`(<${elementTag}[^>]*class=["'][^"']*${escapedClass}[^"']*["'][^>]*>)([^<]*?)(</${elementTag}>)`, 'gis')
                    if (classRegex.test(updatedContent)) {
                      updatedContent = updatedContent.replace(classRegex, `$1${change.newText}$3`)
                    }
                  }
                } else if (originalText && updatedContent.includes(originalText)) {
                  // Fallback: simple text replacement
                  updatedContent = updatedContent.replace(originalText, change.newText)
                }
              }
            })
            
            return {
              ...file,
              content: updatedContent
            }
          }
          
          return file
        })
        
        // DON'T update state here - it causes UI to revert
        // The UI already shows the changes (they're in the iframe/preview)
        // We just need to save them to Supabase
      }
      
      // Save to All Projects (Supabase) - always save, even if no pending changes
      // Store whether we had pending changes BEFORE clearing them
      const hadPendingChanges = pendingTextChanges.size > 0 || pendingCSSChanges.size > 0
      
      // Safety check: Ensure filesToSave is a valid array before proceeding
      if (!filesToSave || !Array.isArray(filesToSave)) {
        console.error('❌ Cannot save: filesToSave is not an array', { 
          filesToSave, 
          type: typeof filesToSave,
          isArray: Array.isArray(filesToSave),
          overrideFiles: overrideFiles ? 'provided' : 'not provided',
          projectFiles: projectFiles ? 'available' : 'not available'
        })
        setSaveStatus('unsaved')
        isInternalUpdateRef.current = false
        alert('Cannot save: Project files are not available. Please reload the project and try again.')
        return
      }
      
      if (currentProjectName) {
        console.log('=== SAVING TO ALL PROJECTS ===')
        console.log('Project name:', currentProjectName)
        console.log('Files count:', filesToSave.length)
        console.log('Is loaded from All Projects:', isLoadedFromAllProjects)
        console.log('Has been saved:', hasBeenSavedToAllProjects)
        
        // ALWAYS use saveProject (update) if project has been saved before
        // This prevents creating duplicates on subsequent saves
        if (isLoadedFromAllProjects || hasBeenSavedToAllProjects) {
          console.log('Project already exists - updating instead of creating new')
          try {
            const { saveProject: updateProject } = await import('./services/projectService')
            const filesForCloud = filesToSave.map(file => ({
              name: file.name,
              content: file.isImage && file.dataUrl ? file.dataUrl : file.content,
              type: file.type || file.name.split('.').pop(),
            }))
            
            // Log CSS file content before saving to verify colors are correct
            const cssFileToSave = filesForCloud.find(f => f.name.endsWith('.css'))
            if (cssFileToSave) {
              const colorRules = cssFileToSave.content.match(/(background-color|color)\s*:\s*[^;]+/gi) || []
              
              // Check for saved colors in the CSS file being saved
              const savedColors = ['#004aeb', '#0854f7', '#004AEB', '#0854F7']
              const foundSavedColors = savedColors.filter(color => cssFileToSave.content.includes(color))
              
              // Check for .section-title color rules
              const sectionTitleColorRules = cssFileToSave.content.match(/\.section-title[^{]*\{[^}]*color[^}]*\}/gi) || []
              const sectionTitleColorValues = sectionTitleColorRules.map(rule => {
                const colorMatch = rule.match(/color\s*:\s*([^;!]+)/i)
                return colorMatch ? colorMatch[1].trim() : null
              }).filter(Boolean)
              
              console.log('💾 Saving CSS file to Supabase:', {
                fileName: cssFileToSave.name,
                contentLength: cssFileToSave.content.length,
                colorRules: colorRules.slice(-10), // Last 10 color rules
                savedColorsFound: foundSavedColors.length > 0 ? `Contains ${foundSavedColors.join(', ')} ✓` : 'No saved colors found ✗',
                sectionTitleColorRules: sectionTitleColorRules.length,
                sectionTitleColorValues: sectionTitleColorValues,
                cssPreview: cssFileToSave.content.includes('.section-title') 
                  ? cssFileToSave.content.substring(
                      Math.max(0, cssFileToSave.content.indexOf('.section-title') - 50),
                      cssFileToSave.content.indexOf('.section-title') + 500
                    )
                  : '.section-title not found'
              })
              
              // Additional debug: Check for page-specific rules
              const pageSpecificRules = cssFileToSave.content.match(/\.page-[a-z0-9-]+\s+[^{]+\{[^}]+\}/gi) || []
              console.log('📄 Page-specific rules in CSS being saved:', pageSpecificRules.length)
              if (pageSpecificRules.length > 0) {
                console.log('📄 Sample page-specific rules:', pageSpecificRules.slice(-5).map(r => r.substring(0, 150)))
              }
              
              // Check for the specific rule we just added
              const realEstateRule = cssFileToSave.content.match(/\.page-real-estate[^{]*\{[^}]+\}/gi)
              if (realEstateRule) {
                console.log('✅ Found .page-real-estate rule in CSS being saved:', realEstateRule[0].substring(0, 200))
              } else {
                console.warn('⚠️ .page-real-estate rule NOT found in CSS being saved!')
              }
            }
            
            const result = await updateProject(currentProjectName, filesForCloud, user.id)
            console.log('✅ Project updated in All Projects successfully')
            
            // Debug: Log CSS file info after processing
            const cssFilesAfter = filesToSave.filter(f => f.name.endsWith('.css'))
            if (cssFilesAfter.length > 0) {
              cssFilesAfter.forEach(cssFile => {
                const pageRules = cssFile.content.match(/\.page-[a-z0-9-]+/gi) || []
                console.log('💾 CSS file AFTER processing - being saved to Supabase:', {
                  name: cssFile.name,
                  length: cssFile.content.length,
                  pageRulesCount: pageRules.length,
                  hasRealEstateRule: cssFile.content.includes('.page-real-estate'),
                  last500Chars: cssFile.content.slice(-500)
                })
              })
            }
            
            // Update projectFiles state with the saved files to keep state in sync with what was saved
            // This ensures that when the project is reloaded, the state reflects the saved changes
            // We do this AFTER save is successful to avoid reverting the UI
            setProjectFiles(filesToSave)
            
            // Clear pending changes
            setPendingTextChanges(new Map());
            setPendingCSSChanges(new Map());
            
            // Clear text editing state after save
            setIsTextEditing(false);
            
            setHasBeenSavedToAllProjects(true)
            setSaveStatus('saved')
            setPendingNavigation(null)
            setShowSavePrompt(false)
            
            // Clear internal update flag
            isInternalUpdateRef.current = false;
            
            console.log('=== ALL PROJECTS UPDATE COMPLETED ===')
          } catch (error) {
            console.error('❌ Failed to update project in All Projects:', error)
            setSaveStatus('unsaved')
            isInternalUpdateRef.current = false
            alert('Failed to save project. Please try again.')
            return
          }
        } else {
          // New project - use saveProjectToAllProjects which handles duplicate checking
          // This will create a new project and set hasBeenSavedToAllProjects to true
          const result = await saveProjectToAllProjects(filesToSave, currentProjectName, false)
          if (result.success) {
            // Update projectFiles state with the saved files to keep state in sync with what was saved
            // This ensures that when the project is reloaded, the state reflects the saved changes
            setProjectFiles(filesToSave)
            
            // Clear pending changes
            setPendingTextChanges(new Map());
            setPendingCSSChanges(new Map());
            
            // Clear text editing state after save
            setIsTextEditing(false);
            
            // CRITICAL: Set this to true so next save uses update instead of create
            setHasBeenSavedToAllProjects(true)
            // Update project name if it was changed (renamed)
            // Only update if it was actually renamed to prevent triggering another save
            if (result.wasRenamed && result.projectName && result.projectName !== currentProjectName) {
              // Update immediately since we know it was renamed and saved successfully
              // The wasRenamed flag ensures we won't check for duplicates again
              setCurrentProjectName(result.projectName)
            } else if (result.projectName && result.projectName !== currentProjectName) {
              // If not explicitly renamed but name changed, use setTimeout to be safe
              setTimeout(() => {
                setCurrentProjectName(result.projectName)
              }, 100)
            }
            // Clear any pending navigation since we just saved manually
            setPendingNavigation(null)
            setShowSavePrompt(false)
            console.log('✅ Project saved to All Projects successfully')
          } else {
            // Check if save was cancelled by user
            if (result.error === 'Save cancelled by user') {
              console.log('Save was cancelled by user')
              setSaveStatus('unsaved')
              isInternalUpdateRef.current = false
              return
            }
            console.error('❌ Failed to save project to All Projects')
            setSaveStatus('unsaved');
            isInternalUpdateRef.current = false;
            return;
          }
          console.log('=== ALL PROJECTS SAVE COMPLETED ===')
        }
      } else {
        console.warn('Cannot save - missing projectName or projectFiles', { 
          hasProjectName: !!currentProjectName, 
          hasProjectFiles: !!projectFiles 
        })
        setSaveStatus('unsaved');
        isInternalUpdateRef.current = false;
        return;
      }
      
      // Update save status
      setSaveStatus('saved');
      setLastSaved(new Date());
      
    } catch (error) {
      console.error('Manual save error:', error);
      setSaveStatus('unsaved'); // Keep as unsaved on error
      isInternalUpdateRef.current = false; // Reset flag on error
    }
  }, [pendingTextChanges, currentProjectName, projectFiles, saveProjectToAllProjects, user]);

  const applyPendingTextChanges = async (persistToFile = false) => {
    console.log('=== APPLYING PENDING TEXT CHANGES ===');
    console.log('Pending changes count:', pendingTextChanges.size);
    console.log('Persist to file:', persistToFile);
    
    if (persistToFile && pendingTextChanges.size > 0) {
      // Just update local files (don't save to cloud - that's manual save only)
      console.log('Persisting changes to local files...');
      pendingTextChanges.forEach((change) => {
        updateHTMLFile(change.newText, change.element, change.fileName);
      });
      console.log('Changes persisted to local files');
    }
    
    // Always keep pending changes until manual save
    // Don't clear them here - user needs to manually save
    console.log('=== PENDING TEXT CHANGES APPLIED ===');
  }

  // Normalize color value to hex format
  const normalizeColorToHex = (color) => {
    if (!color) return color
    
    // If already hex, return as is
    if (typeof color === 'string' && color.startsWith('#')) {
      return color.toLowerCase()
    }
    
    // If RGB/RGBA, convert to hex
    if (typeof color === 'string' && color.startsWith('rgb')) {
      const match = color.match(/\d+/g)
      if (match && match.length >= 3) {
        const r = parseInt(match[0])
        const g = parseInt(match[1])
        const b = parseInt(match[2])
        const hex = '#' + [r, g, b].map(x => {
          const hex = x.toString(16)
          return hex.length === 1 ? '0' + hex : hex
        }).join('')
        return hex.toLowerCase()
      }
    }
    
    // Return as is if can't convert
    return color
  }

  // Store CSS changes for later persistence (similar to pendingTextChanges)
  const storePendingCSSChange = (property, value) => {
    if (!selectedElement) {
      console.warn('storePendingCSSChange: No selectedElement')
      return
    }

    const cssFiles = projectFiles.filter(f => f.name.endsWith('.css'))
    if (cssFiles.length === 0) {
      console.warn('storePendingCSSChange: No CSS files found')
      return
    }

    // Use the first CSS file
    const cssFile = cssFiles[0]

    // Build selector - use the most specific selector available
    let baseSelector = ''
    if (selectedElement.id) {
      baseSelector = `#${selectedElement.id}`
    } else if (selectedElement.className) {
      // Use the full className, not just the first class
      const className = typeof selectedElement.className === 'string' 
        ? selectedElement.className 
        : (selectedElement.className.baseVal || '')
      const classes = className.split(' ').filter(c => c.trim().length > 0)
      if (classes.length > 0) {
        // Use all classes for more specificity
        baseSelector = '.' + classes.join('.')
      } else {
        baseSelector = selectedElement.tagName.toLowerCase()
      }
    } else {
      baseSelector = selectedElement.tagName.toLowerCase()
    }
    
    // Get available HTML pages
    const availablePages = projectFiles
      .filter(f => f.name.endsWith('.html'))
      .map(f => f.name.replace('.html', '').replace(/[^a-zA-Z0-9]/g, '-'))
    
    // Generate selector based on selected pages
    console.log('📝 generateFinalSelector called:')
    console.log('  - baseSelector:', baseSelector)
    console.log('  - selectedPages:', selectedPages)
    console.log('  - currentPage:', currentPage)
    console.log('  - availablePages:', availablePages)
    
    let selector
    if (selectedPages.length === 0 || !selectedPages || selectedPages.length === 0) {
      // Empty selection = current page only
      selector = `.page-${currentPage} ${baseSelector}`
      console.log('  → Current page only:', selector)
    } else if (selectedPages.includes('all')) {
      // "All pages" selected = global selector
      selector = baseSelector
      console.log('  → All pages (global):', selector)
    } else {
      // Multiple specific pages = comma-separated selectors
      // Note: selectedPages already contains transformed page IDs (no .html, sanitized)
      const pageSelectors = selectedPages
        .filter(page => page !== 'all') // Filter out 'all' if somehow included
        .map(page => {
          // Page IDs are already in the correct format, but ensure consistency
          const pageId = page.replace('.html', '').replace(/[^a-zA-Z0-9]/g, '-')
          const pageSelector = `.page-${pageId} ${baseSelector}`
          console.log(`  → Adding page selector for "${pageId}":`, pageSelector)
          return pageSelector
        })
        .join(', ')
      selector = pageSelectors
      console.log('  → Multiple pages (comma-separated):', selector)
    }
    
    console.log('🎯 GENERATED FINAL SELECTOR:', selector)
    console.log('🎯 This will apply to:', 
      selectedPages.length === 0 || !selectedPages || selectedPages.length === 0 
        ? 'CURRENT PAGE ONLY' 
        : selectedPages.includes('all') 
          ? 'ALL PAGES' 
          : `SPECIFIC PAGES: ${selectedPages.filter(p => p !== 'all').join(', ')}`
    )

    // PRESERVE EXACT USER VALUE - don't normalize user input
    // The color picker always returns hex values like #f00000
    // We want to save exactly what the user sets
    let finalValue = value
    
    // Normalize fontSize - ensure it has a unit
    if (property === 'fontSize') {
      if (typeof value === 'string' && value.trim() !== '') {
        const trimmedValue = value.trim();
        // Check if value already has a unit (px, rem, em, %, etc.)
        const hasUnit = /px|rem|em|%|pt|ex|ch|vw|vh|vmin|vmax/i.test(trimmedValue);
        if (!hasUnit && /^\d+\.?\d*$/.test(trimmedValue)) {
          // If it's just a number without a unit, add 'px'
          finalValue = `${trimmedValue}px`;
          console.log('🔧 Added missing unit to fontSize:', value, '->', finalValue);
        } else {
          finalValue = trimmedValue;
        }
      } else if (!value || value === '') {
        // Default fallback if empty
        finalValue = '16px';
        console.log('🔧 Using default fontSize:', finalValue);
      }
    }
    
    // Only normalize if it's clearly not hex (e.g., RGB from computed styles)
    if (property === 'backgroundColor' || property === 'color' || property === 'borderColor') {
      if (typeof value === 'string' && value.startsWith('rgb')) {
        // Only normalize RGB values, preserve hex exactly as user set it
        finalValue = normalizeColorToHex(value)
        console.log('Normalized RGB to hex:', value, '->', finalValue)
      } else if (typeof value === 'string') {
        // Ensure hex values have # prefix if missing
        if (value && !value.startsWith('#') && /^[0-9A-Fa-f]{6}$/i.test(value)) {
          finalValue = '#' + value
          console.log('Added # prefix to hex:', value, '->', finalValue)
        } else if (value.startsWith('#')) {
          // Preserve hex value exactly as user set it (keep original case)
          finalValue = value
          console.log('Preserving exact hex value:', finalValue)
        } else {
          finalValue = value
        }
      }
    }

    // Create a unique key for this CSS change (include page context)
    const changeKey = `${cssFile.name}_${selector}_${property}_${currentPage}`

    console.log('🔵 Storing CSS change:', {
      property: property,
      originalValue: value,
      finalValue: finalValue,
      selector: selector,
      changeKey: changeKey,
      elementTag: selectedElement.tagName,
      elementId: selectedElement.id,
      elementClassName: selectedElement.className
    })
    console.log('🔵 Storing CSS change - VALUES:', `property="${property}"`, `value="${finalValue}"`, `selector="${selector}"`)
    
    // Special logging for color properties to debug persistence issues
    if (property === 'color' || property === 'backgroundColor') {
      console.log(`🎨 COLOR CHANGE STORED: ${property} = "${finalValue}" for selector "${selector}"`)
      console.log(`🎨 VERIFYING PROPERTY NAME: property="${property}" (should be "color" or "backgroundColor")`)
    }
    
    // Special logging for fontSize to ensure units are present
    if (property === 'fontSize') {
      console.log(`📏 FONT SIZE CHANGE STORED: ${property} = "${finalValue}" for selector "${selector}"`)
    }

    // Store the change with exact value
    setPendingCSSChanges(prev => {
      const newMap = new Map(prev)
      // Check if we're overwriting an existing change
      if (prev.has(changeKey)) {
        const oldChange = prev.get(changeKey)
        console.log('⚠️ OVERWRITING existing CSS change:', {
          key: changeKey,
          oldProperty: oldChange.property,
          newProperty: property,
          oldValue: oldChange.value,
          newValue: finalValue,
          selector: selector
        })
        
        // Warn if property name is changing (this shouldn't happen for the same changeKey)
        if (oldChange.property !== property) {
          console.error('❌ PROPERTY NAME CHANGED during overwrite!', {
            old: oldChange.property,
            new: property,
            changeKey: changeKey
          })
        }
      }
      newMap.set(changeKey, {
        fileName: cssFile.name,
        selector: selector, // This is the final selector (with page prefixes if needed)
        baseSelector: baseSelector, // Store base selector for reference
        property: property, // Store the EXACT property name (color or backgroundColor)
        value: finalValue,
        element: selectedElement,
        selectedPages: selectedPages, // Store selected pages for reference
        currentPage: currentPage // Store page context
      })
      
      console.log('✅ CSS change stored with selector:', selector)
      console.log('✅ CSS change stored in Map. Total pending:', newMap.size)
      return newMap
    })

    // Set unsaved status when changes are made
    setSaveStatus('unsaved')
  }

  // Apply pending CSS changes to files (called on manual save)
  const applyPendingCSSChanges = (persistToFiles = true) => {
    if (pendingCSSChanges.size === 0) return null

    const cssFiles = projectFiles.filter(f => f.name.endsWith('.css'))
    if (cssFiles.length === 0) return null

    // Group changes by file
    const changesByFile = new Map()
    pendingCSSChanges.forEach((change, key) => {
      if (!changesByFile.has(change.fileName)) {
        changesByFile.set(change.fileName, [])
      }
      changesByFile.get(change.fileName).push(change)
    })

    // Map to store updated CSS content for each file
    const updatedCSSContent = new Map()

    // Apply changes to each CSS file
    changesByFile.forEach((changes, fileName) => {
      const cssFile = cssFiles.find(f => f.name === fileName)
      if (!cssFile) return

      let cssContent = cssFile.content

      // Group changes by selector
      const changesBySelector = new Map()
      changes.forEach(change => {
        if (!changesBySelector.has(change.selector)) {
          changesBySelector.set(change.selector, [])
        }
        changesBySelector.get(change.selector).push(change)
      })

      // Apply all changes for each selector
      changesBySelector.forEach((selectorChanges, selector) => {
        // Convert property names to CSS properties (camelCase to kebab-case)
        const cssProperties = selectorChanges.map(change => {
          // Convert camelCase to kebab-case for all CSS properties
          const cssProperty = camelToKebab(change.property)
          return { property: cssProperty, value: change.value }
        })

        // Check if selector already exists in CSS
        const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const selectorRegex = new RegExp(`(${escapedSelector})\\s*\\{[^}]*\\}`, 'g')
        const existingRule = cssContent.match(selectorRegex)

        console.log('🟢 CSS Save Debug (applyPendingCSSChanges):', {
          selector: selector,
          escapedSelector: escapedSelector,
          existingRule: existingRule ? existingRule[0].substring(0, 200) : null,
          properties: cssProperties.map(p => `${p.property}: ${p.value}`),
          exactValues: cssProperties.map(p => p.value)
        })
        console.log('🟢 CSS Save Debug - EXACT VALUES BEING WRITTEN (applyPendingCSSChanges):', cssProperties.map(p => `${p.property}="${p.value}"`).join(', '))

        if (existingRule) {
          // Update existing rule - only replace the first match
          const beforeUpdate = cssContent.substring(0, 500)
          const firstMatch = existingRule[0]
          const updatedRule = firstMatch.replace(
            /(\{[^}]*)/,
            (match) => {
              let updated = match
              // Remove existing properties if they exist (case-insensitive)
              cssProperties.forEach(({ property, value }) => {
                const escapedProp = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                const propRegex = new RegExp(`${escapedProp}\\s*:\\s*[^;]+;?`, 'gi')
                updated = updated.replace(propRegex, '')
              })
              // Add new properties with EXACT values (preserve user's exact input)
              // Use !important to ensure our rules override existing ones
              cssProperties.forEach(({ property, value }) => {
                updated += `\n  ${property}: ${value} !important;`
              })
              return updated
            }
          )
          // Replace only the first occurrence by removing the global flag temporarily
          const nonGlobalRegex = new RegExp(`(${escapedSelector})\\s*\\{[^}]*\\}`, '')
          cssContent = cssContent.replace(nonGlobalRegex, updatedRule)
          
          // Check for duplicate rules and remove them, keeping only the updated one (which has all properties)
          const duplicateRuleRegex = new RegExp(`${escapedSelector}\\s*\\{[^}]*\\}`, 'g')
          const duplicateMatches = cssContent.match(duplicateRuleRegex)
          
          if (duplicateMatches && duplicateMatches.length > 1) {
            console.log(`⚠️ Found ${duplicateMatches.length} duplicate rules for ${selector} (applyPendingCSSChanges)`)
            console.log('⚠️ Duplicate rules found:', duplicateMatches.map((r, i) => `Rule ${i + 1}: ${r.substring(0, 200)}`))
            
            // The updatedRule already contains all properties from the original rule plus our changes
            // Remove ALL occurrences (including the one we just updated)
            cssContent = cssContent.replace(duplicateRuleRegex, '')
            
            // Add back ONLY the updated rule (which preserves all original properties + our color change)
            cssContent += updatedRule
            
            console.log('✅ Removed duplicates and kept updated rule with all properties (applyPendingCSSChanges):', updatedRule.substring(0, 200))
          }
          
          const afterUpdate = cssContent.substring(0, 500)
          console.log('🟡 Updated CSS rule (applyPendingCSSChanges):', {
            selector: selector,
            before: beforeUpdate,
            after: afterUpdate,
            updatedRule: updatedRule.substring(0, 200),
            values: cssProperties.map(p => p.value)
          })
          console.log('🟡 Updated CSS rule - EXACT VALUES (applyPendingCSSChanges):', cssProperties.map(p => `${p.property}="${p.value}"`).join(', '))
          console.log('🟡 Full updated rule (applyPendingCSSChanges):', updatedRule)
        } else {
          // Add new rule with EXACT values
          // Use !important to ensure our rules override existing ones
          const properties = cssProperties.map(({ property, value }) => `  ${property}: ${value} !important;`).join('\n')
          const newRule = `\n${selector} {\n${properties}\n}\n`
          cssContent += newRule
          console.log('🟢 Added new CSS rule (applyPendingCSSChanges):', {
            selector: selector,
            rule: newRule,
            values: cssProperties.map(p => p.value)
          })
          console.log('🟢 Added new CSS rule - EXACT VALUES (applyPendingCSSChanges):', cssProperties.map(p => `${p.property}="${p.value}"`).join(', '))
          console.log('🟢 Full new rule (applyPendingCSSChanges):', newRule)
        }
        })

      if (persistToFiles) {
        // Log the final CSS content to verify it contains our changes
        const colorMatches = cssContent.match(/background-color\s*:\s*[^;]+/gi) || []
        const textColorMatches = cssContent.match(/color\s*:\s*[^;]+/gi) || []
        console.log('📝 Final CSS content - Color rules found:', {
          backgroundColors: colorMatches.slice(-5), // Last 5 matches
          textColors: textColorMatches.slice(-5), // Last 5 matches
          contentLength: cssContent.length
        })
        
        // Check for all selectors that were processed (log each one)
        changesBySelector.forEach((selectorChanges, selector) => {
          const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const selectorMatches = cssContent.match(new RegExp(`${escapedSelector}[^}]*{[^}]*}`, 'gi'))
          if (selectorMatches) {
            console.log('📝 CSS content for selector:', selector, selectorMatches[selectorMatches.length - 1])
          }
        })
        
        handleFileUpdate(fileName, cssContent)
      }
      
      // Store updated content for return value
      updatedCSSContent.set(fileName, cssContent)
    })

    // Clear pending changes after applying
    if (persistToFiles) {
      setPendingCSSChanges(new Map())
    }
    
    // Return updated CSS content map
    return updatedCSSContent
  }

  // Function to detect which pages have styles applied from current page
  const detectAppliedPages = useCallback((element, currentPageName) => {
    if (!element || !projectFiles) return []

    console.log('🔍 Detecting applied pages for element on page:', currentPageName)

    // Build base selector from element
    let baseSelector = ''
    if (element.id) {
      baseSelector = `#${element.id}`
    } else if (element.className) {
      const className = typeof element.className === 'string' 
        ? element.className 
        : (element.className.baseVal || '')
      const classes = className.split(' ').filter(c => c.trim().length > 0)
      if (classes.length > 0) {
        baseSelector = '.' + classes.join('.')
      } else {
        baseSelector = element.tagName.toLowerCase()
      }
    } else {
      baseSelector = element.tagName.toLowerCase()
    }

    console.log('🔍 Base selector:', baseSelector)

    // Get the CSS file
    const cssFiles = projectFiles.filter(f => f.name.endsWith('.css'))
    if (cssFiles.length === 0) {
      console.log('⚠️ No CSS file found')
      return []
    }
    const cssFile = cssFiles[0]
    const cssContent = cssFile.content

    // Normalize current page name (remove .html and sanitize)
    const normalizedCurrentPage = currentPageName.replace('.html', '').replace(/[^a-zA-Z0-9]/g, '-')

    // Find all page-specific rules for this selector (INCLUDING current page)
    const escapedBaseSelector = baseSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pageRuleRegex = new RegExp(`\\.page-([a-zA-Z0-9_-]+)\\s+${escapedBaseSelector}\\s*\\{([^}]+)\\}`, 'gi')
    const matches = [...cssContent.matchAll(pageRuleRegex)]

    if (matches.length === 0) {
      console.log('ℹ️ No page-specific rules found for this selector')
      return []
    }

    console.log('✅ Found', matches.length, 'page-specific rule(s) for this selector')

    // Extract page names and their properties (INCLUDING current page)
    const appliedPages = matches
      .map(match => {
        const pageName = match[1] // Extract page name from .page-{name}
        const properties = match[2].trim() // Extract properties from { ... }
        
        // Extract property names from the CSS rule
        const propertyNames = new Set()
        const propertyRegex = /([a-zA-Z-]+)\s*:/g
        let propMatch
        while ((propMatch = propertyRegex.exec(properties)) !== null) {
          propertyNames.add(propMatch[1])
        }
        
        return {
          pageId: pageName,
          pageName: `${pageName}.html`, // Add .html extension for consistency
          properties: Array.from(propertyNames),
          hasStyles: properties.length > 0
        }
      })
      .filter(page => page.hasStyles) // Only include pages that actually have properties

    console.log('🔍 Detected applied pages:', appliedPages.map(p => p.pageName))
    console.log('🔍 Applied pages with properties:', appliedPages.map(p => ({
      page: p.pageName,
      properties: p.properties
    })))

    // Return array of page names (including current page if it has styles)
    return appliedPages.map(p => p.pageName)
  }, [projectFiles])

  // Apply current element's styles to selected pages
  const applyCurrentStylesToPages = useCallback((pages) => {
    if (!selectedElement || !projectFiles || pages.length === 0) {
      console.warn('⚠️ Cannot apply styles - missing element, files, or pages')
      return Promise.resolve(false)
    }

    // ⭐ Preserve selectedPages during apply so checkboxes don't disappear
    const preservedSelectedPages = [...selectedPages]
    console.log('💾 Preserving selectedPages during apply:', preservedSelectedPages)

    setIsApplying(true) // Prevent auto-detect during apply

    console.log('🎨 Applying current styles to pages:', pages)
    console.log('Current element:', selectedElement)
    console.log('Current page:', currentPage)

    // ⭐ CRITICAL FIX: Apply any pending CSS changes FIRST
    // This ensures recent edits (like background color) are saved to a page-specific rule
    // before we try to copy styles to other pages
    let updatedCSSContentMap = null
    if (pendingCSSChanges.size > 0) {
      console.log('💾 Applying pending CSS changes first to create page-specific rule...')
      updatedCSSContentMap = applyPendingCSSChanges(true) // persistToFiles = true
      console.log('✅ Pending CSS changes applied - page-specific rule should now exist')
    }

    // Build base selector from element
    let baseSelector = ''
    if (selectedElement.id) {
      baseSelector = `#${selectedElement.id}`
    } else if (selectedElement.className) {
      const className = typeof selectedElement.className === 'string' 
        ? selectedElement.className 
        : (selectedElement.className.baseVal || '')
      const classes = className.split(' ').filter(c => c.trim().length > 0)
      if (classes.length > 0) {
        baseSelector = '.' + classes.join('.')
      } else {
        baseSelector = selectedElement.tagName.toLowerCase()
      }
    } else {
      baseSelector = selectedElement.tagName.toLowerCase()
    }

    console.log('🎯 Base selector:', baseSelector)

    // Get CSS file (use updated content if available, otherwise use current)
    const cssFiles = projectFiles.filter(f => f.name.endsWith('.css'))
    if (cssFiles.length === 0) {
      console.warn('⚠️ No CSS file found')
      setIsApplying(false)
      return Promise.resolve(false)
    }
    const cssFile = cssFiles[0]
    // Use updated CSS content from applyPendingCSSChanges if available, otherwise use current
    let cssContent = updatedCSSContentMap?.get(cssFile.name) || cssFile.content

    // ⭐ FIXED: First look for the CURRENT page's specific rule
    const currentPageSelector = `.page-${currentPage} ${baseSelector}`
    const escapedCurrentPageSelector = currentPageSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const currentPageRuleRegex = new RegExp(`${escapedCurrentPageSelector}\\s*\\{([^}]+)\\}`, 'i')
    const currentPageMatch = cssContent.match(currentPageRuleRegex)

    let sourceProperties = ''
    let sourceSelector = ''

    if (currentPageMatch) {
      // Found page-specific rule for current page - use this!
      sourceProperties = currentPageMatch[1].trim()
      sourceSelector = currentPageSelector
      console.log('✅ Found current page-specific rule:', sourceSelector)
      console.log('📋 Properties:', sourceProperties.substring(0, 200))
    } else {
      // No current page rule, search for any page-specific or global rule
      console.log('⚠️ No current page-specific rule found, searching for alternatives...')
      console.log('🔍 Looking for rule:', currentPageSelector)

      const escapedBaseSelector = baseSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      // Match: .page-xxx .selector or just .selector (global)
      const allRulesRegex = new RegExp(`([^{}]*${escapedBaseSelector}[^{}]*)\\s*\\{([^}]+)\\}`, 'gi')
      const allMatches = cssContent.matchAll(allRulesRegex)
      const matches = Array.from(allMatches)

      console.log('🔍 Found', matches.length, 'existing rules for base selector:', baseSelector)

      if (matches.length === 0) {
        console.log('⚠️ No existing rules found for this selector anywhere')
        console.log('💡 Tip: Make a style change first, then apply to other pages')
        return Promise.resolve(false)
      }

      // Prefer any page-specific rule over global
      for (const match of matches) {
        const fullSelector = match[1].trim()
        const properties = match[2].trim()

        console.log('📋 Found rule:', fullSelector, '→', properties.substring(0, 100))

        if (fullSelector.includes('.page-')) {
          sourceProperties = properties
          sourceSelector = fullSelector
          console.log('✅ Using page-specific rule as source:', sourceSelector)
          break
        } else {
          // Use global rule as fallback (if no page-specific rule found yet)
          if (!sourceProperties) {
            sourceProperties = properties
            sourceSelector = fullSelector
            console.log('📌 Found global rule (will use if no page-specific rule exists)')
          }
        }
      }
    }

    if (!sourceProperties) {
      console.log('⚠️ No properties found')
      return Promise.resolve(false)
    }

    // ⭐ Track which page styles are being applied FROM
    setStyleSourcePage(currentPage)
    console.log('📌 Tracking source page:', currentPage)

    console.log('📋 Source properties to copy:', sourceProperties.substring(0, 200))
    console.log('📋 From selector:', sourceSelector)

    // Extract which properties are being applied (for tracking)
    const appliedPropertyNames = new Set()
    const propertyRegex = /([a-zA-Z-]+)\s*:/g
    let propMatch
    while ((propMatch = propertyRegex.exec(sourceProperties)) !== null) {
      appliedPropertyNames.add(propMatch[1])
    }
    console.log('📋 Properties being applied:', Array.from(appliedPropertyNames))

    // Generate selectors for selected pages (exclude current page and 'all')
    const currentPageId = currentPage.replace('.html', '').replace(/[^a-zA-Z0-9]/g, '-')
    const targetPages = pages.filter(page => {
      const pageId = page.replace('.html', '').replace(/[^a-zA-Z0-9]/g, '-')
      return page !== 'all' && pageId !== currentPageId
    })

    if (targetPages.length === 0) {
      console.log('⚠️ No target pages selected (excluding current page)')
      console.log('💡 Current page:', currentPageId, 'Selected pages:', pages)
      setIsApplying(false)
      return Promise.resolve(false)
    }

    const newPageSelectors = targetPages.map(page => {
      const pageId = page.replace('.html', '').replace(/[^a-zA-Z0-9]/g, '-')
      return { pageId, pageName: page, selector: `.page-${pageId} ${baseSelector}` }
    })

    console.log('🎯 Target page selectors to create/update:', newPageSelectors.map(p => p.selector))

    // Track which properties were applied to which pages
    const newAppliedPropertiesMap = new Map(appliedPropertiesMap)
    
    // For each target page selector, add or update the rule
    let hasChanges = false
    newPageSelectors.forEach(({ pageId, pageName, selector: pageSelector }) => {
      // Escape for regex
      const escapedPageSelector = pageSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const existingRuleRegex = new RegExp(`${escapedPageSelector}\\s*\\{[^}]+\\}`, 'i')

      if (cssContent.match(existingRuleRegex)) {
        // Update existing rule
        cssContent = cssContent.replace(
          existingRuleRegex,
          `${pageSelector} { ${sourceProperties} }`
        )
        console.log('✏️ Updated existing rule for:', pageSelector)
        hasChanges = true
      } else {
        // Add new rule
        cssContent += `\n${pageSelector} { ${sourceProperties} }\n`
        console.log('➕ Added new rule for:', pageSelector)
        hasChanges = true
      }
      
      // Track which properties were applied to this page
      newAppliedPropertiesMap.set(pageId, new Set(appliedPropertyNames))
      console.log('📝 Tracked properties for', pageName, ':', Array.from(appliedPropertyNames))
    })
    
    // Update the applied properties map
    setAppliedPropertiesMap(newAppliedPropertiesMap)

    if (hasChanges) {
      // Update the CSS file in state FIRST
      handleFileUpdate(cssFile.name, cssContent)
      setSaveStatus('unsaved')
      console.log('✅ Applied current styles to', targetPages.length, 'page(s)')
      console.log('📋 Updated CSS content length:', cssContent.length)
      console.log('📋 CSS file preview (last 500 chars):', cssContent.slice(-500))
      
      // Build updated files array with the new CSS content
      // Use the cssContent directly to ensure we have the latest changes
      const updatedFiles = projectFiles.map(file => 
        file.name === cssFile.name 
          ? { ...file, content: cssContent }
          : file
      )
      
      // Return a promise that resolves after save completes
      return new Promise((resolve) => {
        // Wait a moment for state to update, then save with the updated files
        setTimeout(async () => {
          try {
            console.log('💾 Auto-saving changes...')
            
            // Verify the CSS content has our new rules before saving
            const hasNewRules = newPageSelectors.some(({ selector }) => 
              cssContent.includes(selector)
            )
            console.log('🔍 New rules in CSS content before save:', hasNewRules ? 'YES ✓' : 'NO ✗')
            if (hasNewRules) {
              newPageSelectors.forEach(({ selector }) => {
                const ruleMatch = cssContent.match(
                  new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]+\\}`, 'i')
                )
                if (ruleMatch) {
                  console.log('✅ Found rule in CSS before save:', selector, '→', ruleMatch[0].substring(0, 100))
                } else {
                  console.warn('⚠️ Rule NOT found in CSS before save:', selector)
                }
              })
            }
            
            console.log('📄 CSS content length before save:', cssContent.length)
            console.log('📄 CSS preview (last 500 chars):', cssContent.slice(-500))
            
            // Pass the updated files directly to handleManualSave to ensure it uses the latest CSS
            await handleManualSave(updatedFiles)
            console.log('✅ Styles applied and auto-saved!')
            
            // ⭐ Restore selectedPages after save to keep checkboxes visible
            console.log('💾 Restoring selectedPages after apply:', preservedSelectedPages)
            setSelectedPages(preservedSelectedPages)
            
            // Reset apply flag after successful save
            setIsApplying(false)
            
            resolve(true)
          } catch (error) {
            console.error('❌ Error auto-saving:', error)
            setIsApplying(false) // Reset flag even on error
            resolve(false)
          }
        }, 300) // Delay to ensure state updates propagate
      })
    } else {
      console.log('ℹ️ No changes made')
      setIsApplying(false) // Reset flag if no changes
      return Promise.resolve(false)
    }
  }, [selectedElement, projectFiles, currentPage, styleSourcePage, handleFileUpdate, handleManualSave])

  // Clear applied styles from selected pages (remove CSS rules)
  const clearAppliedStyles = useCallback(async (pagesToClear) => {
    if (!selectedElement || !projectFiles || !pagesToClear || pagesToClear.length === 0) {
      console.warn('⚠️ Cannot clear styles - missing element, files, or pages')
      return false
    }

    // Use the tracked source page (where styles were applied FROM), not current page
    const sourcePage = styleSourcePage || currentPage
    console.log('🗑️ Clearing applied styles from pages:', pagesToClear)
    console.log('🔒 Keeping styles on source page:', sourcePage)
    console.log('📍 Current page:', currentPage, '| Tracked source page:', styleSourcePage)

    // Build base selector from element
    let baseSelector = ''
    if (selectedElement.id) {
      baseSelector = `#${selectedElement.id}`
    } else if (selectedElement.className) {
      const className = typeof selectedElement.className === 'string' 
        ? selectedElement.className 
        : (selectedElement.className.baseVal || '')
      const classes = className.split(' ').filter(c => c.trim().length > 0)
      if (classes.length > 0) {
        baseSelector = '.' + classes.join('.')
      } else {
        baseSelector = selectedElement.tagName.toLowerCase()
      }
    } else {
      baseSelector = selectedElement.tagName.toLowerCase()
    }

    console.log('🎯 Base selector:', baseSelector)

    // Get CSS file
    const cssFiles = projectFiles.filter(f => f.name.endsWith('.css'))
    if (cssFiles.length === 0) {
      console.warn('⚠️ No CSS file found')
      return false
    }
    const cssFile = cssFiles[0]
    let cssContent = cssFile.content

    // Generate selectors for pages to clear (excluding SOURCE page, not current page)
    const sourcePageId = sourcePage.replace('.html', '').replace(/[^a-zA-Z0-9]/g, '-')
    const sourcePageFile = sourcePage.includes('.html') ? sourcePage : `${sourcePage}.html`
    
    const selectorsToRemove = pagesToClear
      .filter(page => {
        // Don't remove "all" or the original source page
        if (page === 'all') return false
        
        // Check if this page matches the source page (handle both with and without .html)
        const pageId = page.replace('.html', '').replace(/[^a-zA-Z0-9]/g, '-')
        const pageFile = page.includes('.html') ? page : `${page}.html`
        
        if (pageId === sourcePageId || pageFile === sourcePageFile || page === sourcePage) {
          console.log('🔒 Protecting source page from removal:', page)
          return false
        }
        return true
      })
      .map(page => {
        const pageId = page.replace('.html', '').replace(/[^a-zA-Z0-9]/g, '-')
        return `.page-${pageId} ${baseSelector}`
      })

    console.log('🗑️ Selectors to remove:', selectorsToRemove)
    console.log('🔒 Protected source page:', sourcePage, '(ID:', sourcePageId, ')')

    if (selectorsToRemove.length === 0) {
      console.log('ℹ️ No selectors to remove (all pages are source page or "all")')
      // Still return true to allow UI to clear selection
      return Promise.resolve(true)
    }

    // Remove each selector's rule
    let hasChanges = false
    selectorsToRemove.forEach(pageSelector => {
      const escapedSelector = pageSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      // Match the rule including newlines before/after
      const ruleRegex = new RegExp(`\\s*${escapedSelector}\\s*\\{[^}]+\\}\\s*\n?`, 'gi')

      const beforeLength = cssContent.length
      cssContent = cssContent.replace(ruleRegex, '')
      const afterLength = cssContent.length

      if (beforeLength > afterLength) {
        console.log('✅ Removed rule for:', pageSelector)
        hasChanges = true
      } else {
        console.log('⚠️ Rule not found for:', pageSelector)
      }
    })

    if (!hasChanges) {
      console.log('ℹ️ No CSS rules were removed')
      return false
    }

    // Update the CSS file in state
    handleFileUpdate(cssFile.name, cssContent)
    setSaveStatus('unsaved')
    console.log('✅ Cleared styles from', selectorsToRemove.length, 'page(s)')
    console.log('📋 Updated CSS content length:', cssContent.length)

    // Build updated files array with the new CSS content
    const updatedFiles = projectFiles.map(file => 
      file.name === cssFile.name 
        ? { ...file, content: cssContent }
        : file
    )

    // Auto-save after clearing
    return new Promise((resolve) => {
      setTimeout(async () => {
        try {
          console.log('💾 Auto-saving after clearing...')
          
          // Verify rules were removed
          const removedRules = selectorsToRemove.filter(selector => 
            !cssContent.includes(selector)
          )
          console.log('🔍 Rules successfully removed:', removedRules.length, 'of', selectorsToRemove.length)
          
          await handleManualSave(updatedFiles)
          console.log('✅ Clear and save completed')
          
          // Reset the source page tracking after clearing
          setStyleSourcePage(null)
          console.log('📌 Reset source page tracking')
          
          resolve(true)
        } catch (error) {
          console.error('❌ Error auto-saving after clear:', error)
          resolve(false)
        }
      }, 300)
    })
  }, [selectedElement, projectFiles, currentPage, styleSourcePage, handleFileUpdate, handleManualSave])

  const handleFileSelect = (file) => {
    console.log('=== FILE SELECT DEBUG ===');
    console.log('Switching from file:', selectedFile?.name, 'to file:', file?.name);
    
    // Update current page when HTML file is selected
    if (file && file.name.endsWith('.html')) {
      const pageId = file.name.replace('.html', '').replace(/[^a-zA-Z0-9]/g, '-')
      setCurrentPage(pageId)
      console.log('Current page updated to:', pageId)
      
      // ⭐ ALWAYS re-detect on page switch (this resets selections)
      // This ensures checkboxes persist when navigating back to source page
      if (selectedElement && projectFiles) {
        // Use a longer delay to ensure state is fully updated
        setTimeout(() => {
          const appliedPages = detectAppliedPages(selectedElement, pageId)
          console.log('🔍 Re-detected applied pages on page switch (raw):', appliedPages)
          
          // Normalize page names to match availablePages format (remove .html, normalize)
          // availablePages uses: f.name.replace('.html', '').replace(/[^a-zA-Z0-9]/g, '-')
          const normalizedAppliedPages = appliedPages.map(pageName => {
            return pageName.replace('.html', '').replace(/[^a-zA-Z0-9]/g, '-')
          })
          
          console.log('🔍 Re-detected applied pages on page switch (normalized):', normalizedAppliedPages)
          console.log('🔍 Current selectedPages before update:', selectedPages)
          console.log('✅ Updating selectedPages to:', normalizedAppliedPages)
          setSelectedPages(normalizedAppliedPages)
        }, 150) // Slightly longer delay to ensure state updates
      } else if (selectedElement && !projectFiles) {
        console.log('⚠️ Cannot re-detect: projectFiles not available')
      } else if (!selectedElement) {
        console.log('ℹ️ No element selected, skipping re-detect')
      }
    }
    
    // Persist pending text changes to local files when switching files
    if (pendingTextChanges.size > 0 && selectedFile && file && selectedFile.name !== file.name) {
      console.log('Persisting pending text changes to local files before file switch');
      applyPendingTextChanges(true); // Persist to local files only
    }
    
    setSelectedFile(file);
    console.log('=== END FILE SELECT DEBUG ===');
  }

  // Helper function to check for duplicate name and handle rename if needed
  const checkAndRenameIfDuplicate = useCallback(async (projectName) => {
    if (!user || !projectName) {
      return { success: true, finalName: projectName }
    }

    // Check if project name already exists in All Projects
    const { listProjects } = await import('./services/projectService')
    const allProjects = await listProjects(user.id)
    
    // Also check recently deleted projects from localStorage as a fallback
    let deletedProjectIds = new Set()
    try {
      const deletedStored = localStorage.getItem('vibecanvas_recently_deleted_projects')
      if (deletedStored) {
        const deletedData = JSON.parse(deletedStored)
        if (Array.isArray(deletedData)) {
          deletedData.forEach(deleted => {
            if (deleted.projectId) {
              deletedProjectIds.add(deleted.projectId)
            }
          })
        }
      }
    } catch (e) {
      // Ignore errors
    }
    
    // Only check active projects (not deleted ones) - use same robust filtering as saveProjectToAllProjects
    const activeProjects = allProjects.filter(p => {
      // Check both camelCase and snake_case property names
      const deletedAt = p.deletedAt || p.deleted_at
      // A project is deleted if it has a valid deletedAt timestamp OR is in deleted list
      const hasDeletedTimestamp = deletedAt && (
        deletedAt !== null && 
        deletedAt !== undefined && 
        deletedAt !== '' &&
        (typeof deletedAt === 'string' && deletedAt.length > 0 && !isNaN(Date.parse(deletedAt)))
      )
      const isInDeletedList = p.id && deletedProjectIds.has(p.id)
      return !hasDeletedTimestamp && !isInDeletedList
    })
    
    const existingProject = activeProjects.find(p => p.name === projectName)
    
    // If no duplicate, return original name
    if (!existingProject || lastSavedNameRef.current === projectName) {
      return { success: true, finalName: projectName }
    }
    
    // Duplicate exists - show rename modal
    const userChoice = await new Promise((resolve) => {
      const handleRename = (newName) => {
        const trimmedName = newName.trim()
        if (!trimmedName || trimmedName === '' || trimmedName === projectName) {
          // Invalid name - don't close modal, just return
          return
        }
        // Check if the new name also exists
        const newNameExists = activeProjects.find(p => p.name === trimmedName)
        if (newNameExists) {
          alert(`A project named "${trimmedName}" already exists. Please choose a different name.`)
          return
        }
        setDuplicateNameModal({ show: false, projectName: '', onRename: null, onCancel: null })
        resolve({ action: 'rename', name: trimmedName })
      }
      
      const handleCancel = () => {
        setDuplicateNameModal({ show: false, projectName: '', onRename: null, onCancel: null })
        resolve({ action: 'cancel' })
      }
      
      setDuplicateNameModal({
        show: true,
        projectName: projectName,
        onRename: handleRename,
        onCancel: handleCancel
      })
    })
    
    if (userChoice.action === 'cancel') {
      return { success: false, finalName: null, error: 'Rename cancelled by user' }
    }
    
    if (userChoice.action === 'rename') {
      // Re-check if the new name exists (in case it was added between the check and now)
      const { listProjects: recheckListProjects } = await import('./services/projectService')
      const recheckProjects = await recheckListProjects(user.id)
      
      // Also check recently deleted projects from localStorage
      let recheckDeletedIds = new Set()
      try {
        const deletedStored = localStorage.getItem('vibecanvas_recently_deleted_projects')
        if (deletedStored) {
          const deletedData = JSON.parse(deletedStored)
          if (Array.isArray(deletedData)) {
            deletedData.forEach(deleted => {
              if (deleted.projectId) {
                recheckDeletedIds.add(deleted.projectId)
              }
            })
          }
        }
      } catch (e) {
        // Ignore errors
      }
      
      const recheckActiveProjects = recheckProjects.filter(p => {
        // Check both camelCase and snake_case property names
        const deletedAt = p.deletedAt || p.deleted_at
        // A project is deleted if it has a valid deletedAt timestamp OR is in deleted list
        const hasDeletedTimestamp = deletedAt && (
          deletedAt !== null && 
          deletedAt !== undefined && 
          deletedAt !== '' &&
          (typeof deletedAt === 'string' && deletedAt.length > 0 && !isNaN(Date.parse(deletedAt)))
        )
        const isInDeletedList = p.id && recheckDeletedIds.has(p.id)
        return !hasDeletedTimestamp && !isInDeletedList
      })
      const recheckExists = recheckActiveProjects.find(p => p.name === userChoice.name)
      if (recheckExists) {
        alert(`A project named "${userChoice.name}" already exists. Please choose a different name.`)
        return { success: false, finalName: null, error: 'New name also exists' }
      }
      return { success: true, finalName: userChoice.name }
    }
    
    return { success: false, finalName: null, error: 'Invalid user choice' }
  }, [user])

  const handleReturnToWelcome = async () => {
    // Check if project needs to be saved (even if user is not logged in)
    if (projectFiles && currentProjectName && !hasBeenSavedToAllProjects) {
      // If user is logged in, check for duplicate name first and rename if needed
      if (user) {
        const renameResult = await checkAndRenameIfDuplicate(currentProjectName)
        if (!renameResult.success) {
          // User cancelled rename or error occurred - abort navigation
          return
        }
        
        // Apply any pending text changes first
        if (pendingTextChanges.size > 0) {
          await applyPendingTextChanges(true)
        }
        
        // Update project name if it was renamed (after applying text changes)
        if (renameResult.finalName !== currentProjectName) {
          setCurrentProjectName(renameResult.finalName)
        }
        
        // Mark that we've already checked for duplicates with this name
        // This prevents the duplicate check from running again in saveProjectToAllProjects
        lastSavedNameRef.current = renameResult.finalName
        
        // Save with the (possibly renamed) name
        // We use allowDuplicates=false to go through normal flow, but lastSavedNameRef prevents duplicate check
        const result = await saveProjectToAllProjects(projectFiles, renameResult.finalName, false)
        if (result.success) {
          setHasBeenSavedToAllProjects(true)
          // Navigate to welcome screen
          await performReturnToWelcome(true)
        } else {
          alert('Failed to save project. Please try again.')
        }
        return
      } else {
        // User not logged in - show save prompt (they need to log in first)
      setPendingNavigation('welcome')
      setShowSavePrompt(true)
      return
      }
    }
    
    // If no save needed, proceed with navigation
    await performReturnToWelcome()
  }

  const performReturnToWelcome = async (skipSave = false) => {
    // Save current project state before navigating away
    if (projectFiles && currentProjectName && !skipSave) {
      // Apply any pending text changes first
      if (pendingTextChanges.size > 0) {
        applyPendingTextChanges(true)
      }
      
      // Save to All Projects before navigating away (if not already saved)
      if (!hasBeenSavedToAllProjects && user) {
        const result = await saveProjectToAllProjects(projectFiles, currentProjectName)
        if (result.success) {
          console.log('Saved project to All Projects before navigating to welcome screen')
        }
      }
    }
    
    // Reset all project state to return to welcome screen (but keep user logged in)
    setProjectFiles(null)
    setSelectedFile(null)
    setSelectedElement(null)
    setCurrentProjectName(null)
    setPendingTextChanges(new Map())
    setPendingCSSChanges(new Map())
    setSaveStatus('saved')
    setLastSaved(null)
    setIsTextEditing(false)
    setIsSettingsOpen(false)
    setHasBeenSavedToAllProjects(false)
    setIsLoadedFromAllProjects(false)
    setShowSavePrompt(false)
    setPendingNavigation(null)
  }

  // Handle page refresh/close
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      // Prompt if project is loaded and not saved (even if user is not logged in)
      if (projectFiles && currentProjectName && !hasBeenSavedToAllProjects) {
        e.preventDefault()
        e.returnValue = 'You have an unsaved project. Do you want to save it before leaving?'
        return e.returnValue
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [projectFiles, currentProjectName, hasBeenSavedToAllProjects])

  // Show full-page loading screen during auth initialization
  // ✅ This check is AFTER all hooks to comply with Rules of Hooks
  if (authLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div className={`app font-size-${fontSize}`}>
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      
      {/* Save Prompt Modal */}
      {showSavePrompt && (
        <div className="save-prompt-overlay" onClick={() => setShowSavePrompt(false)}>
          <div className="save-prompt-modal" onClick={(e) => e.stopPropagation()}>
            <div className="save-prompt-header">
              <h3>Save Project</h3>
            </div>
            <div className="save-prompt-body">
              <p>Do you want to save <strong>"{currentProjectName}"</strong> to All Projects before leaving?</p>
              <p className="save-prompt-info">This will save your project to your account so you can access it later.</p>
            </div>
            <div className="save-prompt-actions">
              <button 
                className="save-prompt-cancel"
                onClick={async () => {
                  setShowSavePrompt(false)
                  if (pendingNavigation === 'welcome') {
                    await performReturnToWelcome()
                  }
                }}
              >
                Don't Save
              </button>
              <button 
                className="save-prompt-confirm"
                onClick={async () => {
                  if (!user) {
                    // User needs to log in first
                    setShowSavePrompt(false)
                    setShowAuthModal(true)
                    // After they log in, they can save manually
                    return
                  }
                  
                  if (projectFiles && currentProjectName) {
                    // Apply any pending text changes first
                    if (pendingTextChanges.size > 0) {
                      applyPendingTextChanges(true)
                    }
                    
                    // Store the navigation target before saving (in case it gets cleared during duplicate check)
                    const navTarget = pendingNavigation
                    
                    const result = await saveProjectToAllProjects(projectFiles, currentProjectName, false)
                    if (result.success) {
                      // Update project name if it was changed (auto-incremented or renamed)
                      if (result.projectName && result.projectName !== currentProjectName) {
                        setCurrentProjectName(result.projectName)
                      }
                      // Ensure hasBeenSavedToAllProjects is set before navigation
                      setHasBeenSavedToAllProjects(true)
                      setShowSavePrompt(false)
                      setPendingNavigation(null)
                      // Navigate if we were trying to navigate before
                      // Pass skipSave=true since we just saved
                      if (navTarget === 'welcome') {
                        await performReturnToWelcome(true)
                      }
                    } else {
                      // If save was cancelled (e.g., user cancelled duplicate name modal), don't show error
                      if (result.error !== 'Save cancelled by user') {
                      alert('Failed to save project. Please try again.')
                      }
                    }
                  }
                }}
              >
                Save Project
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Duplicate Name Modal */}
      {duplicateNameModal.show && (
        <div className="save-prompt-overlay" style={{ zIndex: 10001 }}>
          <div className="save-prompt-modal" onClick={(e) => e.stopPropagation()}>
            <div className="save-prompt-header">
              <h3>Project Name Already Exists</h3>
            </div>
            <div className="save-prompt-body">
              <p>A project named <strong>"{duplicateNameModal.projectName}"</strong> already exists in All Projects.</p>
              <p>Please enter a different project name to continue.</p>
              <div style={{ marginTop: '1rem' }}>
                <input
                  type="text"
                  id="duplicate-name-input"
                  placeholder="Enter new project name"
                  defaultValue=""
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    marginBottom: '0.5rem',
                    background: '#1a1a1a',
                    border: '1px solid #262626',
                    borderRadius: '6px',
                    color: '#e5e5e5',
                    fontSize: '0.875rem',
                    outline: 'none'
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const input = e.target
                      const newName = input.value.trim()
                      if (newName && newName !== duplicateNameModal.projectName && duplicateNameModal.onRename) {
                        duplicateNameModal.onRename(newName)
                      }
                    }
                  }}
                  autoFocus
                />
              </div>
            </div>
            <div className="save-prompt-actions">
              <button 
                className="save-prompt-cancel"
                onClick={() => {
                  if (duplicateNameModal.onCancel) {
                    duplicateNameModal.onCancel()
                  }
                }}
              >
                Cancel
              </button>
              <button 
                className="save-prompt-confirm"
                onClick={() => {
                  const input = document.getElementById('duplicate-name-input')
                  const newName = input?.value?.trim()
                  if (!newName || newName === duplicateNameModal.projectName) {
                    // Invalid name - show error or prevent action
                    alert('Please enter a different project name.')
                    return
                  }
                  if (duplicateNameModal.onRename) {
                    duplicateNameModal.onRename(newName)
                  }
                }}
              >
                Rename & Save
              </button>
            </div>
          </div>
        </div>
      )}

      {!projectFiles ? (
        <FileUploader 
          onProjectLoad={handleProjectLoad}
          key={Date.now()} // Force remount when returning to welcome screen to refresh projects
        />
      ) : (
        <>
          <MenuBar 
            saveStatus={saveStatus}
            lastSaved={lastSaved}
            user={user}
            onAuthClick={() => setShowAuthModal(true)}
            onSaveClick={handleManualSave}
            isInspectorEnabled={isInspectorEnabled}
            onInspectorToggle={handleInspectorToggle}
            onSettingsToggle={handleSettingsToggle}
            onReturnToWelcome={handleReturnToWelcome}
            gridOverlay={gridOverlay}
            onGridOverlayChange={handleGridOverlayChange}
            projectName={currentProjectName}
          />
        <div className="app-layout">
          <div className="preview-section">
            <PreviewPane 
              ref={previewPaneRef}
              files={projectFiles}
              selectedFile={selectedFile}
              selectedElement={selectedElement}
              onElementSelect={handleElementSelect}
              onInspectorToggle={handleInspectorToggle}
              isInspectorEnabled={isInspectorEnabled}
              onSettingsToggle={handleSettingsToggle}
              gridOverlay={gridOverlay}
              gridColor={gridColor}
              isTextEditing={isTextEditing}
              saveStatus={saveStatus}
              lastSaved={lastSaved}
              user={user}
              onAuthClick={() => setShowAuthModal(true)}
              onSaveClick={handleManualSave}
              onFileSelect={handleFileSelect}
            />
          </div>
          
          <aside className="right-panel">
            <TabPanel
              files={projectFiles}
              selectedFile={selectedFile}
              onFileSelect={handleFileSelect}
              selectedElement={selectedElement}
              onPropertyChange={handlePropertyChange}
              availablePages={projectFiles.filter(f => f.name.endsWith('.html')).map(f => f.name.replace('.html', '').replace(/[^a-zA-Z0-9]/g, '-'))}
              selectedPages={selectedPages}
              onSelectedPagesChange={setSelectedPages}
              currentPage={currentPage}
              onFileUpdate={handleFileUpdate}
              onApplyCurrentStyles={applyCurrentStylesToPages}
              onClearAppliedStyles={clearAppliedStyles}
              isInspectorEnabled={isInspectorEnabled}
              isSettingsOpen={isSettingsOpen}
              onSettingsClose={() => setIsSettingsOpen(false)}
              fontSize={fontSize}
              onFontSizeChange={handleFontSizeChange}
              gridOverlay={gridOverlay}
              onGridOverlayChange={handleGridOverlayChange}
              gridColor={gridColor}
              onGridColorChange={handleGridColorChange}
              onTextEditingChange={setIsTextEditing}
              showFileExtensions={showFileExtensions}
              onShowFileExtensionsChange={handleShowFileExtensionsChange}
              lineNumbers={lineNumbers}
              onLineNumbersChange={handleLineNumbersChange}
              tabSize={tabSize}
              onTabSizeChange={handleTabSizeChange}
            />
          </aside>
        </div>
        </>
      )}
    </div>
  )
}

export default App


