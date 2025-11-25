import './Settings.css'

function Settings({ onClose, fontSize, onFontSizeChange, gridOverlay, onGridOverlayChange, gridColor, onGridColorChange }) {
  return (
    <div className="settings">
      <div className="settings-content">
        <div className="settings-section">
          <div className="settings-section-header">
            <h4>General</h4>
        <button 
          className="close-button"
          onClick={onClose}
          title="Close Settings"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z"/>
          </svg>
        </button>
      </div>
          <div className="setting-row">
            <span>Auto-save changes</span>
            <input type="checkbox" defaultChecked />
          </div>
          <div className="setting-row">
            <span>Show file extensions</span>
            <input type="checkbox" defaultChecked />
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-header">
          <h4>Editor</h4>
          </div>
          <div className="setting-row">
            <span>Interface size</span>
            <select 
              value={fontSize} 
              onChange={(e) => onFontSizeChange(e.target.value)}
              className="compact-select"
            >
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </div>
          <div className="setting-row">
            <span>Line numbers</span>
            <input type="checkbox" defaultChecked />
          </div>
          <div className="setting-row">
            <span>Word wrap</span>
            <input type="checkbox" defaultChecked />
          </div>
          <div className="setting-row">
            <span>Tab size</span>
            <select defaultValue="2" className="compact-select">
              <option value="2">2 spaces</option>
              <option value="4">4 spaces</option>
              <option value="8">8 spaces</option>
            </select>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-header">
          <h4>Preview</h4>
          </div>
          <div className="setting-row">
            <span>Auto-refresh on save</span>
            <input type="checkbox" defaultChecked />
          </div>
          <div className="setting-row">
            <span>Grid overlay</span>
            <select 
              value={gridOverlay} 
              onChange={(e) => onGridOverlayChange(e.target.value)}
              className="compact-select"
            >
              <option value="none">None</option>
              <option value="small">Small (8px)</option>
              <option value="flexible">Flexible (12px)</option>
              <option value="medium">Medium (16px)</option>
              <option value="large">Large (24px)</option>
            </select>
          </div>
          {gridOverlay !== 'none' && (
            <div className="setting-row">
              <span>Grid color</span>
              <select 
                value={gridColor} 
                onChange={(e) => onGridColorChange(e.target.value)}
                className="compact-select"
              >
                <option value="blue">Blue</option>
                <option value="white">White</option>
                <option value="red">Red</option>
                <option value="green">Green</option>
                <option value="purple">Purple</option>
                <option value="orange">Orange</option>
              </select>
            </div>
          )}
          <div className="setting-row">
            <span>Responsive preview</span>
            <input type="checkbox" />
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-header">
          <h4>Inspector</h4>
          </div>
          <div className="setting-row">
            <span>Highlight on hover</span>
            <input type="checkbox" defaultChecked />
          </div>
          <div className="setting-row">
            <span>Show element info</span>
            <input type="checkbox" defaultChecked />
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-header">
          <h4>Export</h4>
          </div>
          <div className="setting-row">
            <span>Default format</span>
            <select defaultValue="zip" className="compact-select">
              <option value="zip">ZIP</option>
              <option value="folder">Folder</option>
            </select>
          </div>
          <div className="setting-row">
            <span>Minify CSS</span>
            <input type="checkbox" />
          </div>
          <div className="setting-row">
            <span>Minify JS</span>
            <input type="checkbox" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default Settings
