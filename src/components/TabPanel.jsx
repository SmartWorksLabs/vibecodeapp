import { useState } from 'react'
import FileTree from './FileTree'
import PropertiesPanel from './PropertiesPanel'
import CodeEditor from './CodeEditor'
import Settings from './Settings'
import './TabPanel.css'

function TabPanel({ files, selectedFile, onFileSelect, selectedElement, onPropertyChange, onFileUpdate, isInspectorEnabled, isSettingsOpen, onSettingsClose, fontSize, onFontSizeChange, gridOverlay, onGridOverlayChange, gridColor, onGridColorChange, onTextEditingChange, showFileExtensions, onShowFileExtensionsChange, lineNumbers, onLineNumbersChange, tabSize, onTabSizeChange }) {
  const [activeTab, setActiveTab] = useState('properties')

  const handleFileSelect = (file) => {
    // Don't allow file selection when inspector is disabled and it's an image
    if (!isInspectorEnabled && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(file.type)) {
      return // Do nothing
    }
    
    onFileSelect(file)
    // If it's a CSS or JS file, switch to code tab
    if (file.type === 'css' || file.type === 'js') {
      setActiveTab('code')
    }
    // If it's an HTML file, keep current tab (or could switch to properties)
  }

  // If settings is open, show settings instead of normal tabs
  if (isSettingsOpen) {
    return (
      <div className="tab-panel">
        <Settings 
          onClose={onSettingsClose} 
          fontSize={fontSize}
          onFontSizeChange={onFontSizeChange}
          gridOverlay={gridOverlay}
          onGridOverlayChange={onGridOverlayChange}
          gridColor={gridColor}
          onGridColorChange={onGridColorChange}
          showFileExtensions={showFileExtensions}
          onShowFileExtensionsChange={onShowFileExtensionsChange}
          lineNumbers={lineNumbers}
          onLineNumbersChange={onLineNumbersChange}
          tabSize={tabSize}
          onTabSizeChange={onTabSizeChange}
        />
      </div>
    )
  }

  return (
    <div className="tab-panel">
      <div className="tab-header">
        <button
          className={`tab-button ${activeTab === 'properties' ? 'active' : ''}`}
          onClick={() => setActiveTab('properties')}
        >
          Properties
        </button>
        <button
          className={`tab-button ${activeTab === 'code' ? 'active' : ''}`}
          onClick={() => setActiveTab('code')}
        >
          Code
        </button>
        <button
          className={`tab-button ${activeTab === 'files' ? 'active' : ''}`}
          onClick={() => setActiveTab('files')}
        >
          Files
        </button>
      </div>
      
      <div className="tab-content">
        {activeTab === 'properties' && (
          <PropertiesPanel 
            element={selectedElement} 
            onPropertyChange={onPropertyChange}
            onTextEditingChange={onTextEditingChange}
            isInspectorEnabled={isInspectorEnabled}
          />
        )}
        
        {activeTab === 'code' && (
          selectedFile ? (
            <CodeEditor
              file={selectedFile}
              onFileUpdate={(content) => onFileUpdate(selectedFile.name, content)}
              lineNumbers={lineNumbers}
              tabSize={tabSize}
            />
          ) : (
            <div className="tab-empty">
              <p>Select a file to view its code</p>
            </div>
          )
        )}
        
        {activeTab === 'files' && (
          <FileTree 
            files={files} 
            selectedFile={selectedFile}
            onFileSelect={handleFileSelect}
            isInspectorEnabled={isInspectorEnabled}
            showFileExtensions={showFileExtensions}
          />
        )}
      </div>
    </div>
  )
}

export default TabPanel

