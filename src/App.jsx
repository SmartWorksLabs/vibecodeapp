import { useState, useRef, useEffect, useCallback } from 'react'
import FileUploader from './components/FileUploader'
import PreviewPane from './components/PreviewPane'
import TabPanel from './components/TabPanel'
import AuthModal from './components/AuthModal'
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
  const [isAutoSaving, setIsAutoSaving] = useState(false) // Flag to prevent iframe reload during auto-save
  
  const { user, loading: authLoading } = useAuth()

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
  const isInternalUpdateRef = useRef(false) // Track if update is from auto-save to prevent reload loop

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
    const targetElement = element || selectedElement;
    const targetFile = fileName ? projectFiles?.find(f => f.name === fileName) : selectedFile;
    
    if (!targetElement || !targetFile || targetFile.type !== 'html') {
      console.warn('Cannot update HTML file - missing element or file is not HTML');
      return;
    }

    console.log('Updating HTML file with new text:', newText);
    console.log('Target element:', targetElement);
    console.log('Target file:', targetFile.name);

    let htmlContent = targetFile.content;
    
    // Create a simple text replacement strategy
    // This is a basic implementation - for complex cases, we'd need proper HTML parsing
    
    // Try to find and replace the text content
    const elementTag = targetElement.tagName.toLowerCase();
    const elementId = targetElement.id;
    const elementClass = targetElement.className;
    const originalText = targetElement.textContent;

    console.log('Looking for element:', { tag: elementTag, id: elementId, class: elementClass, originalText });

    // Strategy 1: If element has an ID, find it specifically
    if (elementId) {
      const idRegex = new RegExp(`(<${elementTag}[^>]*id=["']${elementId}["'][^>]*>)([^<]*)(</[^>]*>)`, 'gi');
      const match = htmlContent.match(idRegex);
      if (match) {
        htmlContent = htmlContent.replace(idRegex, `$1${newText}$3`);
        console.log('Updated HTML using ID selector');
        handleFileUpdate(targetFile.name, htmlContent);
        return;
      }
    }

    // Strategy 2: If element has a class, try to find it
    if (elementClass) {
      const firstClass = elementClass.split(' ')[0];
      const classRegex = new RegExp(`(<${elementTag}[^>]*class=["'][^"']*${firstClass}[^"']*["'][^>]*>)([^<]*)(</[^>]*>)`, 'gi');
      const match = htmlContent.match(classRegex);
      if (match) {
        htmlContent = htmlContent.replace(classRegex, `$1${newText}$3`);
        console.log('Updated HTML using class selector');
        handleFileUpdate(targetFile.name, htmlContent);
        return;
      }
    }

    // Strategy 3: Simple text replacement (fallback)
    if (originalText && originalText.trim().length > 0) {
      // Escape special regex characters in the original text
      const escapedOriginalText = originalText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const textRegex = new RegExp(`(>${escapedOriginalText}<)`, 'g');
      if (htmlContent.match(textRegex)) {
        htmlContent = htmlContent.replace(textRegex, `>${newText}<`);
        console.log('Updated HTML using text replacement');
        handleFileUpdate(targetFile.name, htmlContent);
        return;
      }
    }

    console.warn('Could not find element in HTML to update text content');
  }

  // Auto-save function that persists changes to cloud and files
  const autoSave = useCallback(async () => {
    if (pendingTextChanges.size === 0) return;
    if (!user || !projectFiles) {
      // If user is not logged in, just update local files
      if (pendingTextChanges.size > 0 && projectFiles) {
        pendingTextChanges.forEach((change) => {
          updateHTMLFile(change.newText, change.element, change.fileName);
        });
        setPendingTextChanges(new Map());
        setSaveStatus('saved');
        setLastSaved(new Date());
      }
      return;
    }
    
    console.log('=== AUTO-SAVE TRIGGERED ===');
    console.log('Pending changes count:', pendingTextChanges.size);
    setSaveStatus('saving');
    setIsAutoSaving(true); // Prevent iframe reload during auto-save
    
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
      
      // Clear text editing state after auto-save to prevent stuck state
      setIsTextEditing(false);
      
      // Update save status
      setSaveStatus('saved');
      setLastSaved(new Date());
      console.log('=== AUTO-SAVE COMPLETED ===');
    } catch (error) {
      console.error('Auto-save error:', error);
      setSaveStatus('unsaved'); // Keep as unsaved on error
      isInternalUpdateRef.current = false; // Reset flag on error
    } finally {
      // Always clear auto-saving flag
      setIsAutoSaving(false);
    }
  }, [pendingTextChanges, user, currentProjectId, currentProjectName, projectFiles]);

  // Auto-save after 2 seconds of inactivity
  useEffect(() => {
    if (saveStatus === 'unsaved' && pendingTextChanges.size > 0 && user) {
      const autoSaveTimer = setTimeout(() => {
        console.log('Auto-save timer triggered');
        autoSave();
      }, 2000); // 2 second delay
      
      return () => clearTimeout(autoSaveTimer);
    }
  }, [saveStatus, pendingTextChanges.size, user, autoSave]);

  const applyPendingTextChanges = async (forcePersist = false) => {
    console.log('=== APPLYING PENDING TEXT CHANGES ===');
    console.log('Pending changes count:', pendingTextChanges.size);
    console.log('Force persist to file:', forcePersist);
    
    if (forcePersist && pendingTextChanges.size > 0) {
      // Trigger auto-save to cloud
      await autoSave();
    } else {
      // Just clear the pending changes without file updates to avoid reload loop
      console.log('Clearing pending changes without file persistence');
      setPendingTextChanges(new Map());
    }
    
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
    
    // Apply pending text changes when switching files
    if (pendingTextChanges.size > 0 && selectedFile && file && selectedFile.name !== file.name) {
      console.log('Applying pending text changes before file switch');
      applyPendingTextChanges(true); // Force persist when switching files
    }
    
    setSelectedFile(file);
    console.log('=== END FILE SELECT DEBUG ===');
  }

  return (
    <div className={`app font-size-${fontSize}`}>
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      
      {!projectFiles ? (
        <FileUploader onProjectLoad={handleProjectLoad} />
      ) : (
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
              onSaveClick={autoSave}
              isAutoSaving={isAutoSaving}
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
            />
          </aside>
        </div>
      )}
    </div>
  )
}

export default App

