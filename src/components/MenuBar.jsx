import { useState, useEffect } from 'react'
import './MenuBar.css'

// Helper function to format time ago
const formatTimeAgo = (date) => {
  if (!date) return '';
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);
  
  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return `${Math.floor(diffInSeconds / 86400)}d ago`;
};

function MenuBar({ 
  saveStatus, 
  lastSaved, 
  user, 
  onAuthClick, 
  onSaveClick, 
  isInspectorEnabled, 
  onInspectorToggle, 
  onSettingsToggle 
}) {
  const [activeMenu, setActiveMenu] = useState(null)
  const [isMac, setIsMac] = useState(false)

  useEffect(() => {
    // Detect platform
    const platform = navigator.platform.toUpperCase()
    setIsMac(platform.indexOf('MAC') >= 0)
  }, [])

  const menuItems = [
    {
      label: 'File',
      items: [
        { label: 'New Project', shortcut: isMac ? '⌘N' : 'Ctrl+N' },
        { label: 'Open Project...', shortcut: isMac ? '⌘O' : 'Ctrl+O' },
        { label: 'Open Recent', shortcut: '', hasSubmenu: true },
        { type: 'separator' },
        { label: 'Save', shortcut: isMac ? '⌘S' : 'Ctrl+S' },
        { label: 'Save As...', shortcut: isMac ? '⌘⇧S' : 'Ctrl+Shift+S' },
        { type: 'separator' },
        { label: 'Export Project...', shortcut: '' },
        { label: 'Close Project', shortcut: isMac ? '⌘W' : 'Ctrl+W' },
        { type: 'separator' },
        { label: isMac ? 'Quit VibeCanvas' : 'Exit', shortcut: isMac ? '⌘Q' : 'Alt+F4' }
      ]
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', shortcut: isMac ? '⌘Z' : 'Ctrl+Z' },
        { label: 'Redo', shortcut: isMac ? '⌘⇧Z' : 'Ctrl+Shift+Z' },
        { type: 'separator' },
        { label: 'Cut', shortcut: isMac ? '⌘X' : 'Ctrl+X' },
        { label: 'Copy', shortcut: isMac ? '⌘C' : 'Ctrl+C' },
        { label: 'Paste', shortcut: isMac ? '⌘V' : 'Ctrl+V' },
        { type: 'separator' },
        { label: 'Select All', shortcut: isMac ? '⌘A' : 'Ctrl+A' },
        { type: 'separator' },
        { label: 'Find', shortcut: isMac ? '⌘F' : 'Ctrl+F' },
        { label: 'Replace', shortcut: isMac ? '⌘⇧F' : 'Ctrl+H' }
      ]
    },
    {
      label: 'View',
      items: [
        { label: 'Zoom In', shortcut: isMac ? '⌘=' : 'Ctrl+=' },
        { label: 'Zoom Out', shortcut: isMac ? '⌘-' : 'Ctrl+-' },
        { label: 'Reset Zoom', shortcut: isMac ? '⌘0' : 'Ctrl+0' },
        { type: 'separator' },
        { label: 'Toggle Element Inspector', shortcut: isMac ? '⌘⇧I' : 'Ctrl+Shift+I' },
        { label: 'Toggle Grid Overlay', shortcut: isMac ? '⌘⇧G' : 'Ctrl+Shift+G' },
        { type: 'separator' },
        { label: 'Full Screen', shortcut: isMac ? '⌃⌘F' : 'F11' },
        { label: 'Toggle Sidebar', shortcut: isMac ? '⌘B' : 'Ctrl+B' }
      ]
    },
    {
      label: 'Project',
      items: [
        { label: 'Project Settings...', shortcut: '' },
        { label: 'Manage Files...', shortcut: '' },
        { type: 'separator' },
        { label: 'Import Assets...', shortcut: '' },
        { label: 'Export Assets...', shortcut: '' },
        { type: 'separator' },
        { label: 'Project Properties...', shortcut: '' }
      ]
    },
    {
      label: 'Tools',
      items: [
        { label: 'Code Editor', shortcut: isMac ? '⌘⇧E' : 'Ctrl+Shift+E' },
        { label: 'Properties Panel', shortcut: isMac ? '⌘⇧P' : 'Ctrl+Shift+P' },
        { type: 'separator' },
        { label: 'Developer Tools', shortcut: isMac ? '⌥⌘I' : 'Ctrl+Shift+I' },
        { label: 'Console', shortcut: isMac ? '⌥⌘C' : 'Ctrl+Shift+C' }
      ]
    },
    {
      label: 'Help',
      items: [
        { label: 'Documentation', shortcut: '' },
        { label: 'Keyboard Shortcuts', shortcut: isMac ? '⌘K ⌘S' : 'Ctrl+K Ctrl+S' },
        { type: 'separator' },
        { label: 'Report Issue', shortcut: '' },
        { label: 'Check for Updates', shortcut: '' },
        { type: 'separator' },
        { label: 'About VibeCanvas', shortcut: '' }
      ]
    }
  ]

  const handleMenuClick = (menuLabel) => {
    if (activeMenu === menuLabel) {
      setActiveMenu(null)
    } else {
      setActiveMenu(menuLabel)
    }
  }

  const handleMenuBlur = () => {
    // Close menu when clicking outside
    setTimeout(() => {
      setActiveMenu(null)
    }, 200)
  }

  const handleInspectorToggle = () => {
    if (onInspectorToggle) {
      onInspectorToggle(!isInspectorEnabled)
    }
  }

  const handleSettingsClick = () => {
    if (onSettingsToggle) {
      onSettingsToggle()
    }
  }

  return (
    <div className={`menu-bar ${isMac ? 'mac' : 'windows'}`}>
      <div className="menu-bar-left">
        {menuItems.map((menu) => (
          <div key={menu.label} className="menu-item-wrapper">
            <button
              className={`menu-item ${activeMenu === menu.label ? 'active' : ''}`}
              onClick={() => handleMenuClick(menu.label)}
              onBlur={handleMenuBlur}
            >
              {menu.label}
            </button>
            {activeMenu === menu.label && (
              <div className="menu-dropdown">
                {menu.items.map((item, index) => {
                  if (item.type === 'separator') {
                    return <div key={`${menu.label}-sep-${index}`} className="menu-separator" />
                  }
                  return (
                    <div
                      key={`${menu.label}-${index}`}
                      className={`menu-dropdown-item ${item.hasSubmenu ? 'has-submenu' : ''} ${item.shortcut ? '' : 'no-shortcut'}`}
                    >
                      <span className="menu-item-label">{item.label}</span>
                      {item.shortcut && (
                        <span className="menu-item-shortcut">
                          {item.shortcut.split(' ').map((key, i) => (
                            <kbd key={i}>{key}</kbd>
                          ))}
                        </span>
                      )}
                      {item.hasSubmenu && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="menu-bar-right">
        <div className="menu-status-container">
          {!user && (
            <button onClick={onAuthClick} className="menu-auth-button">
              Sign in to save
            </button>
          )}
          {user && saveStatus === 'saving' && (
            <div className="menu-status saving">
              <div className="menu-status-spinner"></div>
              <span>Saving...</span>
            </div>
          )}
          {user && saveStatus === 'unsaved' && (
            <div className="menu-status unsaved">
              <div className="menu-status-dot"></div>
              <span>Unsaved changes</span>
              {onSaveClick && (
                <button onClick={onSaveClick} className="menu-save-button">
                  Save now
                </button>
              )}
            </div>
          )}
          {user && saveStatus === 'saved' && lastSaved && (
            <div className="menu-status saved">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20,6 9,17 4,12"></polyline>
              </svg>
              <span>Saved {formatTimeAgo(lastSaved)}</span>
            </div>
          )}
          {user && saveStatus === 'saved' && !lastSaved && (
            <div className="menu-status saved">
              <span>Ready</span>
            </div>
          )}
        </div>
        <label className="menu-inspector-toggle">
          <input
            type="checkbox"
            checked={isInspectorEnabled}
            onChange={handleInspectorToggle}
          />
          <span>Element Inspector</span>
        </label>
        <button 
          className="menu-settings-button"
          onClick={handleSettingsClick}
          title="Settings"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 15.5A3.5 3.5 0 0 1 8.5 12A3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5a3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97c0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1c0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66Z"/>
          </svg>
        </button>
      </div>
    </div>
  )
}

export default MenuBar

