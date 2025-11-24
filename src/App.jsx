import { useState, useRef, useEffect, useCallback } from 'react'
import FileUploader from './components/FileUploader'
import PreviewPane from './components/PreviewPane'
import TabPanel from './components/TabPanel'
import AuthModal from './components/AuthModal'
import MenuBar from './components/MenuBar'
import { useAuth } from './contexts/AuthContext'
import { saveProject, saveTextChanges } from './services/projectService'
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
  const [pendingTextChanges, setPendingTextChanges] = useState(new Map())
  const [isTextEditing, setIsTextEditing] = useState(false)
  const [saveStatus, setSaveStatus] = useState('saved') // 'saved', 'saving', 'unsaved'
  const [lastSaved, setLastSaved] = useState(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [currentProjectName, setCurrentProjectName] = useState(null)
  const [currentProjectId, setCurrentProjectId] = useState(null)
  
  const { user, loading: authLoading, signOut } = useAuth()

  // Debug state changes
  useEffect(() => {
    console.log('App.jsx: isInspectorEnabled state changed to:', isInspectorEnabled)
  }, [isInspectorEnabled])

  // Show auth modal if user tries to save without being logged in
  useEffect(() => {
    if (saveStatus === 'unsaved' && pendingTextChanges.size > 0 && !user && !authLoading) {
      // Don't auto-show auth modal - let user decide when to authenticate
      // The save will just fail silently until they log in
    }
  }, [saveStatus, pendingTextChanges.size, user, authLoading])

  // Apply pending text changes only on unmount (not on file changes)
  useEffect(() => {
    return () => {
      // Cleanup: apply any pending changes when component unmounts
      if (pendingTextChanges.size > 0) {
        console.log('Component unmounting - persisting pending text changes');
        applyPendingTextChanges(true); // Force persist to file on unmount
      }
    };
  }, []) // Empty deps - only run on unmount
  const [previewKey, setPreviewKey] = useState(0)
  const previewPaneRef = useRef(null)
  const isInternalUpdateRef = useRef(false) // Track if update is from manual save to prevent reload loop

  const handleProjectLoad = async (files) => {
    setProjectFiles(files)
    // Auto-select index.html if available
    const indexHtml = files.find(f => f.name === 'index.html')
    if (indexHtml) {
      setSelectedFile(indexHtml)
    }
    
    // Set default project name if not set
    if (!currentProjectName) {
      // Extract project name from first HTML file or use default
      const firstHtml = files.find(f => f.name.endsWith('.html'))
      const projectName = firstHtml ? firstHtml.name.replace('.html', '') : 'Untitled Project'
      setCurrentProjectName(projectName)
    }
    
    // If user is logged in, save project to cloud
    if (user) {
      try {
        const filesForCloud = files.map(file => ({
          name: file.name,
          content: file.content,
          type: file.type || file.name.split('.').pop(),
        }))
        const result = await saveProject(currentProjectName || 'Untitled Project', filesForCloud, user.id)
        if (result && result.projectId) {
          setCurrentProjectId(result.projectId)
        }
      } catch (error) {
        console.error('Error saving project on load:', error)
      }
    }
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

  // Manual save function that persists changes to cloud and files
  const handleManualSave = useCallback(async () => {
    if (pendingTextChanges.size === 0) {
      console.log('No pending changes to save');
      return;
    }
    
    if (!user || !projectFiles) {
      // If user is not logged in, just update local files
      if (pendingTextChanges.size > 0 && projectFiles) {
        console.log('User not logged in - saving to local files only');
        pendingTextChanges.forEach((change) => {
          updateHTMLFile(change.newText, change.element, change.fileName);
        });
        setPendingTextChanges(new Map());
        setSaveStatus('saved');
        setLastSaved(new Date());
        setIsTextEditing(false);
      }
      return;
    }
    
    console.log('=== MANUAL SAVE TRIGGERED ===');
    console.log('Pending changes count:', pendingTextChanges.size);
    setSaveStatus('saving');
    
    try {
      let projectId = currentProjectId;
      
      // If project doesn't exist in cloud, create it
      if (!projectId) {
        const filesForCloud = projectFiles.map(file => ({
          name: file.name,
          content: file.content,
          type: file.type || file.name.split('.').pop(),
        }));
        
        const result = await saveProject(currentProjectName || 'Untitled Project', filesForCloud, user.id);
        if (result && result.projectId) {
          projectId = result.projectId;
          setCurrentProjectId(projectId);
        }
      }
      
      // Save text changes to cloud if project exists
      if (projectId) {
        for (const [elementKey, change] of pendingTextChanges.entries()) {
          const elementSelector = `${change.element.tagName}${change.element.id ? '#' + change.element.id : ''}${change.element.className ? '.' + change.element.className.split(' ')[0] : ''}`;
          
          // Save to Supabase text_changes table
          await saveTextChanges(
            projectId,
            change.fileName,
            elementSelector,
            change.originalText || '',
            change.newText,
            user.id
          );
        }
        
        // Save all files to cloud project
        const filesForCloud = projectFiles.map(file => ({
          name: file.name,
          content: file.content,
          type: file.type || file.name.split('.').pop(),
        }));
        
        await saveProject(currentProjectName || 'Untitled Project', filesForCloud, user.id);
      }
      
      // Mark as internal update to prevent reload loop
      isInternalUpdateRef.current = true;
      
      // Update local file content
      pendingTextChanges.forEach((change) => {
        updateHTMLFile(change.newText, change.element, change.fileName);
      });
      
      // Clear internal update flag after a short delay
      setTimeout(() => {
        isInternalUpdateRef.current = false;
      }, 100);
      
      // Clear pending changes after saving
      setPendingTextChanges(new Map());
      
      // Clear text editing state after save
      setIsTextEditing(false);
      
      // Update save status
      setSaveStatus('saved');
      setLastSaved(new Date());
      console.log('=== MANUAL SAVE COMPLETED ===');
    } catch (error) {
      console.error('Manual save error:', error);
      setSaveStatus('unsaved'); // Keep as unsaved on error
      isInternalUpdateRef.current = false; // Reset flag on error
    }
  }, [pendingTextChanges, user, currentProjectId, currentProjectName, projectFiles]);

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

  const handleLogout = async () => {
    // Sign out from auth
    await signOut()
    // Reset all project state to return to welcome screen
    setProjectFiles(null)
    setSelectedFile(null)
    setSelectedElement(null)
    setCurrentProjectName(null)
    setCurrentProjectId(null)
    setPendingTextChanges(new Map())
    setSaveStatus('saved')
    setLastSaved(null)
    setIsTextEditing(false)
    setIsSettingsOpen(false)
  }

  return (
    <div className={`app font-size-${fontSize}`}>
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      
      {!projectFiles ? (
        <FileUploader onProjectLoad={handleProjectLoad} />
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
            onLogout={handleLogout}
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
              onLogout={handleLogout}
            />
          </aside>
        </div>
        </>
      )}
    </div>
  )
}

export default App


