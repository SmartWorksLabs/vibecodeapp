import { useState } from 'react'
import FileTree from './FileTree'
import PropertiesPanel from './PropertiesPanel'
import CodeEditor from './CodeEditor'
import './TabPanel.css'

function TabPanel({ files, selectedFile, onFileSelect, selectedElement, onPropertyChange, onFileUpdate, isInspectorEnabled }) {
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
            isInspectorEnabled={isInspectorEnabled}
          />
        )}
        
        {activeTab === 'code' && (
          selectedFile ? (
            <CodeEditor
              file={selectedFile}
              onFileUpdate={(content) => onFileUpdate(selectedFile.name, content)}
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
          />
        )}
      </div>
    </div>
  )
}

export default TabPanel

