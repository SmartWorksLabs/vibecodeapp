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

function App() {
  console.log('App component rendering/re-rendering')
  const [projectFiles, setProjectFiles] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [selectedElement, setSelectedElement] = useState(null)
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

  // Apply pending text changes only on unmount (not on file changes)
  // Store pendingTextChanges in a ref so cleanup can access the latest value
  const pendingTextChangesRef = useRef(pendingTextChanges)
  
  // Keep ref in sync with state
  useEffect(() => {
    pendingTextChangesRef.current = pendingTextChanges
  }, [pendingTextChanges])
  
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
    console.log('findNextAvailableProjectName: All projects from DB:', allProjects.map(p => ({ name: p.name, deletedAt: p.deletedAt })))
    
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
    console.log('findNextAvailableProjectName: Active projects:', activeProjects.map(p => p.name))
    
    const existingNames = new Set(activeProjects.map(p => p.name))
    console.log('findNextAvailableProjectName: Existing names:', Array.from(existingNames))
    
    if (!existingNames.has(baseName)) {
      console.log('findNextAvailableProjectName: Base name available:', baseName)
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
    console.log('findNextAvailableProjectName: Next available name:', newName)
    return newName
  }, [])

  // Save project to "All Projects" (user account/Supabase) - this is the source of truth
  const saveProjectToAllProjects = useCallback(async (files, projectName, allowDuplicates = false) => {
    if (!files || files.length === 0 || !projectName) {
      console.log('saveProjectToAllProjects: Skipping - missing files or projectName', { files: !!files, filesLength: files?.length, projectName })
      return { success: false, projectId: null }
    }
    
    if (!user) {
      console.warn('Cannot save to All Projects - user not logged in')
      return { success: false, projectId: null }
    }
    
    // Prevent duplicate saves
    if (isSavingRef.current) {
      console.log('Save already in progress, skipping duplicate call')
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
        console.log('saveProjectToAllProjects: Checking for duplicate. All projects:', allProjects.map(p => ({ name: p.name, deletedAt: p.deletedAt, deleted_at: p.deleted_at })))
        
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
        console.log('saveProjectToAllProjects: Deleted project IDs from localStorage:', Array.from(deletedProjectIds))
        
        // Only check active projects (not deleted ones)
        // deletedAt will be null/undefined/empty string for active projects, or a timestamp string for deleted ones
        const activeProjects = allProjects.filter(p => {
          // Check both camelCase and snake_case property names (Supabase converts to camelCase, but be safe)
          const deletedAt = p.deletedAt || p.deleted_at
          
          // Debug logging for the project we're checking
          if (p.name === projectName) {
            console.log('🔍 Checking project for duplicate:', {
              name: p.name,
              projectId: p.id,
              deletedAt: deletedAt,
              deletedAtType: typeof deletedAt,
              isNull: deletedAt === null,
              isUndefined: deletedAt === undefined,
              isEmpty: deletedAt === '',
              canParse: deletedAt && typeof deletedAt === 'string' ? !isNaN(Date.parse(deletedAt)) : false,
              isInDeletedList: deletedProjectIds.has(p.id)
            })
          }
          
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
          
          if (!isActive) {
            console.log('✅ Filtering out deleted project:', p.name, {
              hasDeletedTimestamp,
              isInDeletedList,
              deletedAt
            })
          }
          return isActive
        })
        console.log('saveProjectToAllProjects: Active projects:', activeProjects.map(p => p.name))
        console.log('saveProjectToAllProjects: Filtered out', allProjects.length - activeProjects.length, 'deleted projects')
        console.log('saveProjectToAllProjects: Checking for project name:', projectName)
        
        // Skip duplicate check if we just saved this exact name (prevents modal from appearing twice)
        if (lastSavedNameRef.current === projectName) {
          console.log('Skipping duplicate check - this name was just saved:', projectName)
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
          
          if (!isActuallyActive) {
            console.log('⚠️ Project found but it\'s deleted - skipping:', p.name, {
              hasDeletedTimestamp: pHasDeletedTimestamp,
              isInDeletedList: pIsInDeletedList,
              deletedAt: pDeletedAt
            })
          }
          
          return isActuallyActive
        })
        
        console.log('saveProjectToAllProjects: existingProject found:', existingProject ? {
          name: existingProject.name,
          id: existingProject.id,
          deletedAt: existingProject.deletedAt || existingProject.deleted_at
        } : null)
        
        if (existingProject && lastSavedNameRef.current !== projectName) {
          console.log('⚠️ DUPLICATE FOUND - showing modal for:', projectName, 'existing project:', existingProject)
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
    console.log('=== ELEMENT SELECT DEBUG ===')
    console.log('handleElementSelect called with element:', element?.tagName)
    console.log('handleElementSelect called with inspectorState:', inspectorState)
    console.log('Current isInspectorEnabled:', isInspectorEnabled)
    console.log('Will update inspector state?', inspectorState !== null && inspectorState !== undefined)
    
    // Don't apply pending changes when just switching elements in the same file
    // Text changes will persist in the preview and be saved when navigating away from the file
    console.log('Element switch - keeping text changes in preview only');
    
    // Clear text editing state when switching elements
    setIsTextEditing(false);
    
    setSelectedElement(element)
    
    // Update inspector state ONLY if explicitly provided (not undefined)
    if (inspectorState !== null && inspectorState !== undefined) {
      console.log('*** OVERRIDING INSPECTOR STATE ***')
      console.log('Updating inspector state from', isInspectorEnabled, 'to:', inspectorState)
      setIsInspectorEnabled(inspectorState)
    }
    console.log('=== END ELEMENT SELECT DEBUG ===')
  }

  // Debounce ref for inspector toggle
  const inspectorToggleDebounceRef = useRef(null)

  // Separate handler for inspector toggle to avoid confusion
  const handleInspectorToggle = (newInspectorState) => {
    console.log('=== TOGGLE DEBUG ===')
    console.log('handleInspectorToggle called with:', newInspectorState)
    console.log('Current isInspectorEnabled state:', isInspectorEnabled)
    
    // Clear any pending toggle
    if (inspectorToggleDebounceRef.current) {
      clearTimeout(inspectorToggleDebounceRef.current)
    }
    
    // Debounce rapid toggles (50ms)
    inspectorToggleDebounceRef.current = setTimeout(() => {
      console.log('Applying inspector toggle:', newInspectorState)
    setIsInspectorEnabled(newInspectorState)
      
      // Clear selection and text editing when turning off inspector
    if (!newInspectorState) {
      setSelectedElement(null)
        setIsTextEditing(false)
    }
      
      inspectorToggleDebounceRef.current = null
      console.log('=== END TOGGLE DEBUG ===')
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
    console.log('=== APP PROPERTY CHANGE DEBUG ===');
    console.log('App.handlePropertyChange called:', { property, value, childElement });
    console.log('selectedElement:', selectedElement);
    console.log('previewPaneRef.current exists:', !!previewPaneRef.current);
    
    if (!selectedElement || !previewPaneRef.current) {
      console.warn('Cannot update property - missing selectedElement or previewPaneRef');
      console.log('selectedElement exists:', !!selectedElement);
      console.log('previewPaneRef.current exists:', !!previewPaneRef.current);
      return;
    }

    // Handle child text content updates
    if (property === 'childTextContent') {
      console.log('Updating child text content:', value, 'for element:', childElement);
      previewPaneRef.current.updateElementStyle('childTextContent', value, childElement);
      return;
    }

    // Handle text content separately (update HTML)
    if (property === 'textContent') {
      console.log('*** TEXT CONTENT UPDATE DETECTED ***');
      console.log('Updating text content:', value);
      setIsTextEditing(true); // Mark that text editing is active
      updateHTMLTextContent(value);
      console.log('*** TEXT CONTENT UPDATE COMPLETE ***');
      return;
    }

    console.log('Updating style property via postMessage');
    // Update preview immediately via postMessage (don't reload iframe)
    previewPaneRef.current.updateElementStyle(property, value);

    // Also update CSS file for persistence (but don't trigger reload)
    updateCSSFile(property, value);
    console.log('=== END APP PROPERTY CHANGE DEBUG ===');
  }

  const updateHTMLTextContent = (newText) => {
    console.log('=== UPDATE HTML TEXT CONTENT DEBUG ===');
    console.log('updateHTMLTextContent called with:', newText);
    console.log('previewPaneRef.current exists:', !!previewPaneRef.current);
    
    // Update the preview immediately via postMessage
    if (previewPaneRef.current) {
      console.log('Sending text content update to iframe');
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
      console.log('Text change stored for persistence:', elementKey, newText);
      
      // Set unsaved status when changes are made
      setSaveStatus('unsaved');
    }
    console.log('=== END UPDATE HTML TEXT CONTENT DEBUG ===');
  }

  const updateHTMLFile = (newText, element = selectedElement, fileName = selectedFile?.name) => {
    console.log('=== UPDATE HTML FILE DEBUG START ===');
    const targetElement = element || selectedElement;
    const targetFile = fileName ? projectFiles?.find(f => f.name === fileName) : selectedFile;
    
    // Aggressive debugging
    console.log('newText:', newText);
    console.log('newText type:', typeof newText);
    console.log('newText length:', newText?.length);
    console.log('targetElement exists:', !!targetElement);
    console.log('targetFile exists:', !!targetFile);
    
    if (!targetElement || !targetFile) {
      console.error('Missing element or file!', {
        hasElement: !!targetElement,
        hasFile: !!targetFile
      });
      console.log('=== UPDATE HTML FILE DEBUG END (FAILED - MISSING) ===');
      return;
    }
    
    if (targetFile.type !== 'html') {
      console.warn('File is not HTML:', targetFile.type);
      console.log('=== UPDATE HTML FILE DEBUG END (FAILED - NOT HTML) ===');
      return;
    }

    // Extract element properties with detailed logging
    const elementTag = targetElement.tagName ? targetElement.tagName.toLowerCase() : null;
    const elementId = targetElement.id || null;
    const elementClass = targetElement.className ? (typeof targetElement.className === 'string' ? targetElement.className : targetElement.className.baseVal || '') : null;
    const originalText = targetElement.textContent || targetElement.innerText || '';
    const outerHTML = targetElement.outerHTML || '';
    const innerHTML = targetElement.innerHTML || '';
    const hasChildren = targetElement.children && targetElement.children.length > 0;

    console.log('Element properties:', {
      tag: elementTag,
      id: elementId,
      class: elementClass,
      originalText: originalText,
      originalTextLength: originalText?.length,
      outerHTML: outerHTML?.substring(0, 200),
      innerHTML: innerHTML?.substring(0, 200),
      hasChildren: hasChildren,
      childrenCount: targetElement.children?.length || 0
    });
    console.log('Target file:', targetFile.name);
    console.log('HTML content length:', targetFile.content?.length);

    let htmlContent = targetFile.content;
    
    if (!htmlContent) {
      console.error('HTML content is empty or undefined!');
      console.log('=== UPDATE HTML FILE DEBUG END (FAILED - NO CONTENT) ===');
      return;
    }

    // Ensure newText is a string
    if (typeof newText !== 'string') {
      console.warn('newText is not a string, converting:', typeof newText, newText);
      newText = String(newText);
    }

    // Strategy 1: If element has an ID, find it specifically
    if (elementId) {
      console.log('Trying ID-based replacement for ID:', elementId);
      // Match opening tag with ID, handle both with and without nested children
      const escapedId = elementId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      if (!hasChildren) {
        // No children - simple text replacement
        const idRegex = new RegExp(`(<${elementTag}[^>]*id=["']${escapedId}["'][^>]*>)([^<]*?)(</${elementTag}>)`, 'gis');
        const match = htmlContent.match(idRegex);
        if (match) {
          console.log('Found match using ID (no children):', match[0].substring(0, 100));
          const beforeLength = htmlContent.length;
          htmlContent = htmlContent.replace(idRegex, `$1${newText}$3`);
          const afterLength = htmlContent.length;
          console.log('HTML content length changed:', beforeLength, '->', afterLength);
          
          // Validate HTML content after replacement
          if (!htmlContent || htmlContent.trim().length === 0) {
            console.error('HTML content became empty after replacement!');
            console.log('=== UPDATE HTML FILE DEBUG END (FAILED - EMPTY) ===');
            return;
          }
          
          console.log('Updated HTML using ID selector');
          handleFileUpdate(targetFile.name, htmlContent);
          console.log('=== UPDATE HTML FILE DEBUG END (ID SUCCESS) ===');
          return;
        }
      } else {
        // Has children - need to preserve structure, only update direct text nodes
        // Match the opening tag and try to find text immediately after it (before first child tag)
        const idRegexWithText = new RegExp(`(<${elementTag}[^>]*id=["']${escapedId}["'][^>]*>)([^<]+?)(<)`, 'gis');
        const matchWithText = htmlContent.match(idRegexWithText);
        if (matchWithText && matchWithText[2].trim() === originalText.trim()) {
          console.log('Found match using ID (has children, text before first child):', matchWithText[0].substring(0, 100));
          const beforeLength = htmlContent.length;
          htmlContent = htmlContent.replace(idRegexWithText, `$1${newText}$3`);
          const afterLength = htmlContent.length;
          console.log('HTML content length changed:', beforeLength, '->', afterLength);
          
          // Validate HTML content after replacement
          if (!htmlContent || htmlContent.trim().length === 0) {
            console.error('HTML content became empty after replacement!');
            console.log('=== UPDATE HTML FILE DEBUG END (FAILED - EMPTY) ===');
            return;
          }
          
          console.log('Updated HTML using ID selector (preserved children)');
          handleFileUpdate(targetFile.name, htmlContent);
          console.log('=== UPDATE HTML FILE DEBUG END (ID SUCCESS WITH CHILDREN) ===');
          return;
        }
      }
      console.warn('No match found for ID:', elementId);
    }

    // Strategy 2: If element has a class, try to find it
    if (elementClass) {
      const firstClass = elementClass.split(' ')[0];
      console.log('Trying class-based replacement for class:', firstClass);
      const escapedClass = firstClass.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      if (!hasChildren) {
        // No children - simple text replacement
        const classRegex = new RegExp(`(<${elementTag}[^>]*class=["'][^"']*${escapedClass}[^"']*["'][^>]*>)([^<]*?)(</${elementTag}>)`, 'gis');
        const match = htmlContent.match(classRegex);
        if (match) {
          console.log('Found match using class (no children):', match[0].substring(0, 100));
          const beforeLength = htmlContent.length;
          htmlContent = htmlContent.replace(classRegex, `$1${newText}$3`);
          const afterLength = htmlContent.length;
          console.log('HTML content length changed:', beforeLength, '->', afterLength);
          
          // Validate HTML content after replacement
          if (!htmlContent || htmlContent.trim().length === 0) {
            console.error('HTML content became empty after replacement!');
            console.log('=== UPDATE HTML FILE DEBUG END (FAILED - EMPTY) ===');
            return;
          }
          
          console.log('Updated HTML using class selector');
          handleFileUpdate(targetFile.name, htmlContent);
          console.log('=== UPDATE HTML FILE DEBUG END (CLASS SUCCESS) ===');
          return;
        }
      } else {
        // Has children - preserve structure
        const classRegexWithText = new RegExp(`(<${elementTag}[^>]*class=["'][^"']*${escapedClass}[^"']*["'][^>]*>)([^<]+?)(<)`, 'gis');
        const matchWithText = htmlContent.match(classRegexWithText);
        if (matchWithText && matchWithText[2].trim() === originalText.trim()) {
          console.log('Found match using class (has children, text before first child):', matchWithText[0].substring(0, 100));
          const beforeLength = htmlContent.length;
          htmlContent = htmlContent.replace(classRegexWithText, `$1${newText}$3`);
          const afterLength = htmlContent.length;
          console.log('HTML content length changed:', beforeLength, '->', afterLength);
          
          // Validate HTML content after replacement
          if (!htmlContent || htmlContent.trim().length === 0) {
            console.error('HTML content became empty after replacement!');
            console.log('=== UPDATE HTML FILE DEBUG END (FAILED - EMPTY) ===');
            return;
          }
          
          console.log('Updated HTML using class selector (preserved children)');
          handleFileUpdate(targetFile.name, htmlContent);
          console.log('=== UPDATE HTML FILE DEBUG END (CLASS SUCCESS WITH CHILDREN) ===');
          return;
        }
      }
      console.warn('No match found for class:', firstClass);
    }

    // Strategy 3: Text-based replacement (most fallback, least reliable)
    if (originalText && originalText.trim().length > 0) {
      console.log('Trying text-based replacement');
      // Escape special regex characters in the original text
      const escapedOriginalText = originalText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Try to match text between tags (more flexible pattern)
      const textRegex = new RegExp(`(>\\s*)${escapedOriginalText}(\\s*<)`, 'gs');
      const match = htmlContent.match(textRegex);
      if (match) {
        console.log('Found match using text replacement');
        const beforeLength = htmlContent.length;
        htmlContent = htmlContent.replace(textRegex, `$1${newText}$2`);
        const afterLength = htmlContent.length;
        console.log('HTML content length changed:', beforeLength, '->', afterLength);
        
        // Validate HTML content after replacement
        if (!htmlContent || htmlContent.trim().length === 0) {
          console.error('HTML content became empty after replacement!');
          console.log('=== UPDATE HTML FILE DEBUG END (FAILED - EMPTY) ===');
          return;
        }
        
        console.log('Updated HTML using text replacement');
        handleFileUpdate(targetFile.name, htmlContent);
        console.log('=== UPDATE HTML FILE DEBUG END (TEXT SUCCESS) ===');
        return;
      } else {
        console.warn('Text pattern not found in HTML');
      }
    }

    console.error('=== COULD NOT UPDATE HTML ===');
    console.error('Failed to find element in HTML. Element details:', {
      tag: elementTag,
      id: elementId,
      class: elementClass,
      originalText: originalText?.substring(0, 50),
      htmlPreview: htmlContent?.substring(0, 500)
    });
    console.log('=== UPDATE HTML FILE DEBUG END (FAILED) ===');
  }

  // Manual save function that persists changes and saves to All Projects
  const handleManualSave = useCallback(async () => {
    if (!projectFiles) {
      console.warn('Cannot save - no project files');
      return;
    }
    
    if (!user) {
      console.warn('Cannot save - user not logged in');
      setShowAuthModal(true);
      return;
    }
    
    console.log('=== MANUAL SAVE TRIGGERED ===');
    console.log('Pending changes count:', pendingTextChanges.size);
    // Clear any pending navigation and save prompt when saving manually
    setPendingNavigation(null)
    setShowSavePrompt(false)
    setSaveStatus('saving');
    
    try {
      // Mark as internal update to prevent reload loop
      isInternalUpdateRef.current = true;
      
      // Update local file content if there are pending changes
      if (pendingTextChanges.size > 0) {
        pendingTextChanges.forEach((change) => {
          updateHTMLFile(change.newText, change.element, change.fileName);
        });
      }
      
      // Clear internal update flag after a short delay
      setTimeout(() => {
        isInternalUpdateRef.current = false;
      }, 100);
      
      // Clear pending changes after saving
      setPendingTextChanges(new Map());
      
      // Clear text editing state after save
      setIsTextEditing(false);
      
      // Save to All Projects (Supabase) - always save, even if no pending changes
      if (currentProjectName && projectFiles) {
        console.log('=== SAVING TO ALL PROJECTS ===')
        console.log('Project name:', currentProjectName)
        console.log('Files count:', projectFiles.length)
        const result = await saveProjectToAllProjects(projectFiles, currentProjectName, false)
        if (result.success) {
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
      
      console.log('=== MANUAL SAVE COMPLETED ===');
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

  const updateCSSFile = (property, value) => {
    if (!selectedElement) return

    const cssFiles = projectFiles.filter(f => f.name.endsWith('.css'))
    if (cssFiles.length === 0) return

    // Use the first CSS file (or could be smarter about which one to use)
    const cssFile = cssFiles[0]
    let cssContent = cssFile.content

    // Build selector
    let selector = ''
    if (selectedElement.id) {
      selector = `#${selectedElement.id}`
    } else if (selectedElement.className) {
      const firstClass = selectedElement.className.split(' ')[0]
      selector = `.${firstClass}`
    } else {
      selector = selectedElement.tagName.toLowerCase()
    }

    // Convert property name to CSS property
    const cssProperty = property === 'borderRadius' ? 'border-radius' :
                        property === 'fontSize' ? 'font-size' :
                        property === 'backgroundColor' ? 'background-color' :
                        property

    // Check if selector already exists in CSS
    const selectorRegex = new RegExp(`(${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\s*\\{[^}]*\\}`, 'g')
    const existingRule = cssContent.match(selectorRegex)

    if (existingRule) {
      // Update existing rule
      const updatedRule = existingRule[0].replace(
        /(\{[^}]*)/,
        (match) => {
          // Remove existing property if it exists
          const propRegex = new RegExp(`${cssProperty.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:[^;]+;?`, 'g')
          let updated = match.replace(propRegex, '')
          // Add new property
          updated += `\n  ${cssProperty}: ${value};`
          return updated
        }
      )
      cssContent = cssContent.replace(selectorRegex, updatedRule)
    } else {
      // Add new rule
      const newRule = `\n${selector} {\n  ${cssProperty}: ${value};\n}\n`
      cssContent += newRule
    }

    handleFileUpdate(cssFile.name, cssContent)
  }

  const handleFileSelect = (file) => {
    console.log('=== FILE SELECT DEBUG ===');
    console.log('Switching from file:', selectedFile?.name, 'to file:', file?.name);
    
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
            onProjectNameChange={(newName) => {
              setCurrentProjectName(newName)
              // If project was already saved, mark as unsaved since name changed
              if (hasBeenSavedToAllProjects) {
                setHasBeenSavedToAllProjects(false)
              }
            }}
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
              onFileUpdate={handleFileUpdate}
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


