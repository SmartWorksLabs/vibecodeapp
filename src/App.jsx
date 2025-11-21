import { useState, useRef, useEffect } from 'react'
import FileUploader from './components/FileUploader'
import PreviewPane from './components/PreviewPane'
import TabPanel from './components/TabPanel'
import ExportButton from './components/ExportButton'
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

  // Debug state changes
  useEffect(() => {
    console.log('App.jsx: isInspectorEnabled state changed to:', isInspectorEnabled)
  }, [isInspectorEnabled])
  const [previewKey, setPreviewKey] = useState(0)
  const previewPaneRef = useRef(null)

  const handleProjectLoad = (files) => {
    setProjectFiles(files)
    // Auto-select index.html if available
    const indexHtml = files.find(f => f.name === 'index.html')
    if (indexHtml) {
      setSelectedFile(indexHtml)
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
    
    setSelectedElement(element)
    
    // Update inspector state ONLY if explicitly provided (not undefined)
    if (inspectorState !== null && inspectorState !== undefined) {
      console.log('*** OVERRIDING INSPECTOR STATE ***')
      console.log('Updating inspector state from', isInspectorEnabled, 'to:', inspectorState)
      setIsInspectorEnabled(inspectorState)
    }
    console.log('=== END ELEMENT SELECT DEBUG ===')
  }

  // Separate handler for inspector toggle to avoid confusion
  const handleInspectorToggle = (newInspectorState) => {
    console.log('=== TOGGLE DEBUG ===')
    console.log('handleInspectorToggle called with:', newInspectorState)
    console.log('Current isInspectorEnabled state:', isInspectorEnabled)
    console.log('About to call setIsInspectorEnabled with:', newInspectorState)
    setIsInspectorEnabled(newInspectorState)
    console.log('setIsInspectorEnabled called (state update is async)')
    console.log('=== END TOGGLE DEBUG ===')
    // Clear selection when turning off inspector
    if (!newInspectorState) {
      setSelectedElement(null)
    }
  }

  const handlePropertyChange = (property, value) => {
    console.log('App.handlePropertyChange called:', { property, value, selectedElement });
    
    if (!selectedElement || !previewPaneRef.current) {
      console.warn('Cannot update property - missing selectedElement or previewPaneRef');
      return;
    }

    // Handle child text content updates
    if (property === 'childTextContent') {
      console.log('Updating child text content:', value);
      previewPaneRef.current.updateElementStyle('childTextContent', value);
      return;
    }

    // Handle text content separately (update HTML)
    if (property === 'textContent') {
      console.log('Updating text content:', value);
      updateHTMLTextContent(value);
      return;
    }

    console.log('Updating style property via postMessage');
    // Update preview immediately via postMessage (don't reload iframe)
    previewPaneRef.current.updateElementStyle(property, value);

    // Also update CSS file for persistence (but don't trigger reload)
    updateCSSFile(property, value);
  }

  const updateHTMLTextContent = (newText) => {
    console.log('updateHTMLTextContent called with:', newText);
    
    // For now, just update the preview immediately via postMessage
    // The HTML file update can be done later for persistence
    if (previewPaneRef.current) {
      console.log('Sending text content update to iframe');
      previewPaneRef.current.updateElementStyle('textContent', newText);
    }
    
    // TODO: Also update the actual HTML file for persistence
    // This would require proper HTML parsing to find and update the specific element
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

  return (
    <div className="app">
      <header className="app-header">
        <h1>VibeCanvas</h1>
        {projectFiles && (
          <ExportButton files={projectFiles} />
        )}
      </header>
      
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
            />
          </div>
          
          <aside className="right-panel">
            <TabPanel
              files={projectFiles}
              selectedFile={selectedFile}
              onFileSelect={setSelectedFile}
              selectedElement={selectedElement}
              onPropertyChange={handlePropertyChange}
              onFileUpdate={handleFileUpdate}
              isInspectorEnabled={isInspectorEnabled}
            />
          </aside>
        </div>
      )}
    </div>
  )
}

export default App

