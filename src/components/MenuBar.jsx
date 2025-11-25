import { useState, useEffect, useRef } from 'react'
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
  onSettingsToggle,
  onReturnToWelcome
}) {
  const [activeMenu, setActiveMenu] = useState(null)
  const [isMac, setIsMac] = useState(false)
  const blurTimeoutRef = useRef(null)

  useEffect(() => {
    // Detect platform
    const platform = navigator.platform.toUpperCase()
    setIsMac(platform.indexOf('MAC') >= 0)
    
    // Cleanup timeout on unmount
    return () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current)
      }
    }
  }, [])

  const menuItems = [
    {
      label: 'File',
      items: [
        { label: 'New Project' },
        { label: 'Open Project...' },
        { label: 'Open Recent', hasSubmenu: true },
        { type: 'separator' },
        { label: 'Save' },
        { label: 'Save As...' },
        { type: 'separator' },
        { label: 'Export Project...' },
        { label: 'Close Project' },
        { type: 'separator' },
        { label: isMac ? 'Quit VibeCanvas' : 'Exit' }
      ]
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo' },
        { label: 'Redo' },
        { type: 'separator' },
        { label: 'Cut' },
        { label: 'Copy' },
        { label: 'Paste' },
        { type: 'separator' },
        { label: 'Select All' },
        { type: 'separator' },
        { label: 'Find' },
        { label: 'Replace' }
      ]
    },
    {
      label: 'View',
      items: [
        { label: 'Zoom In' },
        { label: 'Zoom Out' },
        { label: 'Reset Zoom' },
        { type: 'separator' },
        { label: 'Toggle Element Inspector' },
        { label: 'Toggle Grid Overlay' },
        { type: 'separator' },
        { label: 'Full Screen' },
        { label: 'Toggle Sidebar' }
      ]
    },
    {
      label: 'Project',
      items: [
        { label: 'Project Settings...' },
        { label: 'Manage Files...' },
        { type: 'separator' },
        { label: 'Import Assets...' },
        { label: 'Export Assets...' },
        { type: 'separator' },
        { label: 'Project Properties...' }
      ]
    },
    {
      label: 'Tools',
      items: [
        { label: 'Code Editor' },
        { label: 'Properties Panel' },
        { type: 'separator' },
        { label: 'Developer Tools' },
        { label: 'Console' }
      ]
    },
    {
      label: 'Help',
      items: [
        { label: 'Documentation' },
        { label: 'Keyboard Shortcuts' },
        { type: 'separator' },
        { label: 'Report Issue' },
        { label: 'Check for Updates' },
        { type: 'separator' },
        { label: 'About VibeCanvas' }
      ]
    }
  ]

  const handleMenuClick = (menuLabel) => {
    // Cancel any pending blur timeout
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current)
      blurTimeoutRef.current = null
    }
    
    if (activeMenu === menuLabel) {
      setActiveMenu(null)
    } else {
      setActiveMenu(menuLabel)
    }
  }

  const handleMenuBlur = (e) => {
    // Check if the blur is because we're clicking on another menu item
    // If the related target is another menu button, don't close
    const relatedTarget = e.relatedTarget
    if (relatedTarget && relatedTarget.closest('.menu-item')) {
      return // Don't close if clicking on another menu item
    }
    
    // Close menu when clicking outside
    blurTimeoutRef.current = setTimeout(() => {
      setActiveMenu(null)
      blurTimeoutRef.current = null
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

  const handleMenuItemClick = (itemLabel) => {
    if (itemLabel === (isMac ? 'Quit VibeCanvas' : 'Exit')) {
      if (onReturnToWelcome) {
        onReturnToWelcome()
      }
    }
    // Close menu after clicking
    setActiveMenu(null)
  }

  return (
    <div className={`menu-bar ${isMac ? 'mac' : 'windows'}`}>
      <div className="menu-bar-left">
        {menuItems.map((menu) => (
          <div key={menu.label} className="menu-item-wrapper">
            <button
              className={`menu-item ${activeMenu === menu.label ? 'active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault() // Prevent blur from firing first
                handleMenuClick(menu.label)
              }}
              onBlur={handleMenuBlur}
            >
              {menu.label}
            </button>
            {activeMenu === menu.label && (
              <div 
                className="menu-dropdown"
                onMouseEnter={() => {
                  // Cancel blur timeout when mouse enters dropdown
                  if (blurTimeoutRef.current) {
                    clearTimeout(blurTimeoutRef.current)
                    blurTimeoutRef.current = null
                  }
                }}
              >
                {menu.items.map((item, index) => {
                  if (item.type === 'separator') {
                    return <div key={`${menu.label}-sep-${index}`} className="menu-separator" />
                  }
                  return (
                    <div
                      key={`${menu.label}-${index}`}
                      className={`menu-dropdown-item ${item.hasSubmenu ? 'has-submenu' : ''}`}
                      onClick={() => handleMenuItemClick(item.label)}
                    >
                      <span className="menu-item-label">{item.label}</span>
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

