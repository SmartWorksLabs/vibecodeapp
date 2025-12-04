import { useState, useEffect, useCallback, useRef } from 'react'
import './PropertiesPanel.css'

function PropertiesPanel({ element, onPropertyChange, isInspectorEnabled, onTextEditingChange, availablePages = [], selectedPages = [], onSelectedPagesChange, currentPage, onApplyCurrentStyles, onClearAppliedStyles }) {
  const [isPageSelectorOpen, setIsPageSelectorOpen] = useState(false)
  const [stylesApplied, setStylesApplied] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  
  // Ref to track if we're updating checkboxes programmatically (during element selection)
  // This prevents onChange from firing when checkboxes are updated by code
  const isProgrammaticUpdateRef = useRef(false)
  
  // When element changes, set flag to prevent onChange from firing during programmatic checkbox updates
  useEffect(() => {
    if (element) {
      // Set flag to ignore onChange events during programmatic updates
      isProgrammaticUpdateRef.current = true
      console.log('🔒 Setting programmatic update flag (element changed)')
      
      // Clear flag after a short delay to allow checkboxes to update
      // This ensures user clicks after element selection will work normally
      const timeout = setTimeout(() => {
        isProgrammaticUpdateRef.current = false
        console.log('🔓 Clearing programmatic update flag')
      }, 200) // 200ms should be enough for checkboxes to update
      
      return () => clearTimeout(timeout)
    }
  }, [element])
  
  const [properties, setProperties] = useState({
    textContent: '',
    placeholder: '',
    backgroundColor: '#ffffff',
    color: '#000000',
    fontSize: '16px',
    textAlign: 'left',
    borderWidth: '0',
    borderColor: '#000000',
    borderStyle: 'solid',
    width: 'auto',
    height: 'auto',
    display: 'block'
  })
  
  // Local state for text inputs to prevent cursor jumping
  const [localTextContent, setLocalTextContent] = useState('')
  const [localPlaceholder, setLocalPlaceholder] = useState('')
  const [localFontSize, setLocalFontSize] = useState('')
  const [childTextElements, setChildTextElements] = useState([])
  const liveUpdateTimeoutRef = useRef(null)

  // Function to extract child text elements
  const getChildTextElements = useCallback((element) => {
    if (!element || !element.tagName) {
      console.log('Invalid element passed to getChildTextElements:', element);
      return [];
    }
    
    console.log('=== ANALYZING ELEMENT FOR CHILD TEXT ===');
    console.log('Root element:', element.tagName, element.id, element.className);
    console.log('Root element children count:', element.children?.length || 0);
    
    const textElements = [];
    
    // Simple approach: find all elements with text content within the selected element
    const findAllTextElements = (container) => {
      // Get all descendant elements
      const allElements = container.querySelectorAll('*');
      console.log('Total descendant elements found:', allElements.length);
      
      allElements.forEach((el, index) => {
        const hasText = el.textContent && el.textContent.trim().length > 0;
        const isTextTag = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'SPAN', 'A', 'STRONG', 'EM', 'B', 'I'].includes(el.tagName);
        const isLeafElement = el.children.length === 0;
        
        // Include if it's a text tag OR a leaf element with text
        if (hasText && (isTextTag || isLeafElement)) {
          const textContent = el.textContent.trim();
          
          // Avoid duplicates and very short text
          if (textContent.length > 2) {
            // Check if this text is already included in a parent element we've added
            const isDuplicate = textElements.some(existing => 
              existing.textContent.includes(textContent) || textContent.includes(existing.textContent)
            );
          
            if (!isDuplicate) {
              console.log(`Found text element ${index + 1}: ${el.tagName} - "${textContent.substring(0, 50)}..."`);
            textElements.push({
              element: el,
                text: textContent,
                textContent: textContent,
              tagName: el.tagName,
              className: el.className || '',
                id: el.id || ''
              });
            } else {
              console.log(`Skipping duplicate text element: ${el.tagName} - "${textContent.substring(0, 30)}..."`);
          }
          }
        }
      });
      };
    
    try {
      findAllTextElements(element);
      console.log('=== FINAL RESULT ===');
      console.log('Total unique text elements found:', textElements.length);
      textElements.forEach((te, i) => {
        console.log(`  ${i + 1}. ${te.tagName}${te.id ? '#' + te.id : ''}${te.className ? '.' + te.className.split(' ')[0] : ''} - "${te.textContent.substring(0, 40)}..."`);
      });
      console.log('=== END ANALYSIS ===');
    } catch (error) {
      console.error('Error in getChildTextElements:', error, element);
    }
    
    return textElements;
  }, []);

  useEffect(() => {
    if (element) {
      console.log('PropertiesPanel received element:', element);
      console.log('Element textContent:', element.textContent);
      
      const newTextContent = element.textContent || '';
      const newPlaceholder = element.placeholder || '';
      
      // Normalize colors to hex format for consistency
      const normalizeColor = (color) => {
        if (!color) return color
        if (typeof color === 'string' && color.startsWith('#')) {
          return color.toLowerCase()
        }
        if (typeof color === 'string' && color.startsWith('rgb')) {
          const match = color.match(/\d+/g)
          if (match && match.length >= 3) {
            const r = parseInt(match[0])
            const g = parseInt(match[1])
            const b = parseInt(match[2])
            return '#' + [r, g, b].map(x => {
              const hex = x.toString(16)
              return hex.length === 1 ? '0' + hex : hex
            }).join('').toLowerCase()
          }
        }
        return color
      }

      const fontSizeValue = element.styles?.fontSize || '16px'

      setProperties({
        textContent: newTextContent,
        placeholder: newPlaceholder,
        backgroundColor: normalizeColor(element.styles?.backgroundColor) || '#ffffff',
        color: normalizeColor(element.styles?.color) || '#000000',
        fontSize: fontSizeValue,
        textAlign: element.styles?.textAlign || 'left',
        borderWidth: parseBorderWidth(element.styles?.border || '0'),
        borderColor: normalizeColor(parseBorderColor(element.styles?.border || '#000000')),
        borderStyle: parseBorderStyle(element.styles?.border || 'solid'),
        width: element.styles?.width || 'auto',
        height: element.styles?.height || 'auto',
        display: element.styles?.display || 'block'
      })
      
      // Initialize local font size state to prevent cursor jumping
      setLocalFontSize(fontSizeValue)
      
      // Check for child text elements - use data from iframe if available
      console.log('=== CHILD TEXT DETECTION DEBUG ===');
      console.log('Element selected:', element.tagName, element.id, element.className);
      console.log('Element object keys:', Object.keys(element));
      console.log('Element.childTextElements:', element.childTextElements);
      
      let childTexts = [];
      
      // Use child text elements from iframe if available
      if (element.childTextElements && Array.isArray(element.childTextElements)) {
        console.log('Using child text elements from iframe:', element.childTextElements.length);
        childTexts = element.childTextElements.map(child => ({
          element: child, // This is the serialized element data
          text: child.textContent || child.text || '',
          textContent: child.textContent || child.text || '',
          tagName: child.tagName || 'UNKNOWN',
          className: child.className || '',
          id: child.id || ''
        }));
      } else {
        // Fallback to local detection (though this won't work with serialized elements)
        console.log('No child text elements from iframe, trying local detection');
        childTexts = getChildTextElements(element);
      }
      
      console.log('Final child text elements found:', childTexts.length);
      console.log('Child text elements:', childTexts);
      
      if (childTexts.length >= 2) {
        // Multiple child text elements - show separate inputs
        console.log('Using child text elements mode - found', childTexts.length, 'elements');
        setChildTextElements(childTexts);
        setLocalTextContent(''); // Clear main text content
      } else {
        // Single text element or no children - use main text content
        console.log('Using single text content mode - only found', childTexts.length, 'elements');
        setChildTextElements([]);
        setLocalTextContent(newTextContent);
      }
      console.log('=== END CHILD TEXT DETECTION DEBUG ===');
      
      setLocalPlaceholder(newPlaceholder)
    }
  }, [element])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (liveUpdateTimeoutRef.current) {
        clearTimeout(liveUpdateTimeoutRef.current);
      }
    };
  }, [])

  // Auto-resize textarea when text content changes
  useEffect(() => {
    const resizeTextarea = (textarea) => {
      if (textarea) {
        // Reset height to auto to get the correct scrollHeight
        textarea.style.height = 'auto';
        // Set height to scrollHeight to fit content (max 200px)
        textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
      }
    };

    // Resize main text content textarea
    const mainTextarea = document.querySelector('.property-textarea:not(.child-text-input)');
    resizeTextarea(mainTextarea);

    // Resize all child text element textareas
    const childTextareas = document.querySelectorAll('.child-text-input');
    childTextareas.forEach(resizeTextarea);
    
  }, [localTextContent, childTextElements])

  // Auto-resize child textareas when they first appear
  useEffect(() => {
    if (childTextElements.length > 0) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        const childTextareas = document.querySelectorAll('.child-text-input');
        childTextareas.forEach(textarea => {
          if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
          }
        });
      }, 10);
    }
  }, [childTextElements.length])


  const parseBorderWidth = (border) => {
    const match = border.match(/(\d+(?:\.\d+)?)px/)
    return match ? match[1] : '0'
  }

  const parseBorderColor = (border) => {
    const match = border.match(/(?:rgb|rgba|#)[\w()]+/)
    return match ? match[0] : '#000000'
  }

  const parseBorderStyle = (border) => {
    const styles = ['solid', 'dashed', 'dotted', 'none']
    for (const style of styles) {
      if (border.includes(style)) return style
    }
    return 'solid'
  }

  // Live text content update (short debounce for real-time feel)
  const updateTextContentLive = useCallback((value) => {
    // Set text editing state to true when starting to type
    if (onTextEditingChange) {
      onTextEditingChange(true);
    }
    
    if (liveUpdateTimeoutRef.current) {
      clearTimeout(liveUpdateTimeoutRef.current);
    }
    
    liveUpdateTimeoutRef.current = setTimeout(() => {
      console.log('=== LIVE TEXT UPDATE DEBUG ===');
      console.log('Live text content update:', value);
      console.log('onPropertyChange function exists:', !!onPropertyChange);
      
      if (onPropertyChange) {
        console.log('Calling onPropertyChange with textContent (live)');
        onPropertyChange('textContent', value);
      }
      setProperties(prev => ({ ...prev, textContent: value }));
      console.log('=== END LIVE TEXT UPDATE DEBUG ===');
    }, 150); // 150ms for real-time feel
  }, [onPropertyChange, onTextEditingChange]);

  // Final text content update (immediate on blur/enter)
  const updateTextContentFinal = useCallback((value) => {
    if (liveUpdateTimeoutRef.current) {
      clearTimeout(liveUpdateTimeoutRef.current);
    }
    
    // Set text editing state to false when done editing
    if (onTextEditingChange) {
      onTextEditingChange(false);
    }
    
    console.log('=== FINAL TEXT UPDATE DEBUG ===');
    console.log('Final text content update called with value:', value);
    console.log('onPropertyChange function exists:', !!onPropertyChange);
    console.log('Current element:', element);
    
    if (onPropertyChange) {
      console.log('Calling onPropertyChange with textContent');
      onPropertyChange('textContent', value);
    } else {
      console.error('onPropertyChange is not available!');
    }
    setProperties(prev => ({ ...prev, textContent: value }));
    console.log('=== END FINAL TEXT UPDATE DEBUG ===');
  }, [onPropertyChange, element, onTextEditingChange]);
    
  // Handle child text element updates
  const handleChildTextChange = useCallback((childElement, newText, isFinal = false) => {
    console.log('=== CHILD TEXT UPDATE DEBUG ===');
    console.log('Updating child text:', childElement, 'to:', newText, 'isFinal:', isFinal);
    
    // Set text editing state
    if (onTextEditingChange) {
      onTextEditingChange(!isFinal);
    }
    
    if (onPropertyChange) {
      // Update the specific child element
      onPropertyChange('childTextContent', newText, childElement);
    }
    
    console.log('=== END CHILD TEXT UPDATE DEBUG ===');
  }, [onPropertyChange, onTextEditingChange]);

  const handlePropertyChange = (prop, value) => {
    console.log('PropertiesPanel.handlePropertyChange:', { prop, value });
    setProperties(prev => ({ ...prev, [prop]: value }))
    
    if (!onPropertyChange) return

    // Handle text content separately (needs HTML update)
    if (prop === 'textContent') {
      onPropertyChange('textContent', value)
      return
    }

    // Convert property name to CSS property
    if (prop === 'borderWidth' || prop === 'borderColor' || prop === 'borderStyle') {
      // Update all border properties together
      const borderValue = `${properties.borderWidth}px ${properties.borderStyle} ${properties.borderColor}`
      onPropertyChange('border', borderValue)
    } else {
      // Map to CSS property names
      const cssPropMap = {
        backgroundColor: 'backgroundColor',
        color: 'color',
        fontSize: 'fontSize',
        textAlign: 'textAlign',
        width: 'width',
        height: 'height',
        display: 'display'
      }
      const cssProp = cssPropMap[prop] || prop
      onPropertyChange(cssProp, value)
    }
  }

  if (!element) {
    return (
      <div className="properties-panel">
        <div className="properties-empty">
          {isInspectorEnabled ? (
            <p>Click on an element to edit its properties</p>
          ) : (
            <p>Turn on Element Inspector to select and edit elements</p>
          )}
        </div>
      </div>
    )
  }
  
  // Show scope toggle when we have an element and currentPage is available
  // Always show it if currentPage exists (even if empty string, we'll default to 'index')
  const showScopeToggle = element && (currentPage !== undefined && currentPage !== null)

  // Convert technical HTML terms to user-friendly names
  const getFriendlyElementName = (childEl) => {
    const tagName = childEl.tagName?.toLowerCase() || 'text';
    const className = childEl.className || '';
    const id = childEl.id || '';
    
    // Create a base friendly name from the tag
    let friendlyName = '';
    
    switch (tagName) {
      case 'h1':
        friendlyName = 'Main Heading';
        break;
      case 'h2':
        friendlyName = 'Section Heading';
        break;
      case 'h3':
        friendlyName = 'Subheading';
        break;
      case 'h4':
      case 'h5':
      case 'h6':
        friendlyName = 'Small Heading';
        break;
      case 'p':
        friendlyName = 'Paragraph';
        break;
      case 'span':
        friendlyName = 'Text';
        break;
      case 'a':
        friendlyName = 'Link';
        break;
      case 'div':
        friendlyName = 'Text Block';
        break;
      case 'strong':
      case 'b':
        friendlyName = 'Bold Text';
        break;
      case 'em':
      case 'i':
        friendlyName = 'Italic Text';
        break;
      case 'button':
        friendlyName = 'Button';
        break;
      case 'label':
        friendlyName = 'Label';
        break;
      case 'li':
        friendlyName = 'List Item';
        break;
      default:
        friendlyName = 'Text Element';
    }
    
    // Add context from class names or IDs to make it more specific
    if (className) {
      const firstClass = className.split(' ')[0];
      if (firstClass.includes('title')) {
        friendlyName = 'Title';
      } else if (firstClass.includes('subtitle')) {
        friendlyName = 'Subtitle';
      } else if (firstClass.includes('description')) {
        friendlyName = 'Description';
      } else if (firstClass.includes('tag')) {
        friendlyName = 'Tag';
      } else if (firstClass.includes('price')) {
        friendlyName = 'Price';
      } else if (firstClass.includes('address')) {
        friendlyName = 'Address';
      } else if (firstClass.includes('feature')) {
        friendlyName = 'Feature';
      } else if (firstClass.includes('category')) {
        friendlyName = 'Category';
      } else if (firstClass.includes('label')) {
        friendlyName = 'Label';
      } else if (firstClass.includes('name')) {
        friendlyName = 'Name';
      } else if (firstClass.includes('content')) {
        friendlyName = 'Content';
      }
    }
    
    if (id) {
      if (id.includes('title')) {
        friendlyName = 'Title';
      } else if (id.includes('subtitle')) {
        friendlyName = 'Subtitle';
      } else if (id.includes('description')) {
        friendlyName = 'Description';
      }
    }
    
    return friendlyName;
  }

  return (
    <div className="properties-panel">
      <div className="properties-header">
        <div className="element-info">
          <span className="element-tag">{element.tagName}</span>
          {element.id && <span className="element-id">#{element.id}</span>}
          {element.className && <span className="element-class">.{element.className.split(' ')[0]}</span>}
        </div>
      </div>
      
      <div className="properties-content">
        
        {/* Page selector - multi-select for choosing which pages styles apply to */}
        {availablePages.length > 0 && (
          <div className="property-group page-selector-container">
            <div 
              className="page-selector-header"
              onClick={() => setIsPageSelectorOpen(!isPageSelectorOpen)}
            >
              <span>Apply styles to other pages</span>
              <span className={`arrow ${isPageSelectorOpen ? 'open' : ''}`}>▼</span>
            </div>
            
            {isPageSelectorOpen && (
              <div className="page-selector-content">
                <div className="page-checkboxes">
                  <label className="page-option">
                    <input 
                      type="checkbox"
                      checked={selectedPages.includes('all') || (selectedPages.length === availablePages.length && availablePages.length > 0)}
                      onChange={(e) => {
                        // Ignore onChange if this is a programmatic update (not user-initiated)
                        if (isProgrammaticUpdateRef.current) {
                          console.log('🔘 Ignoring programmatic checkbox update for "all"')
                          return
                        }
                        console.log('🔘 All pages checkbox changed (user click):', e.target.checked)
                        if (onSelectedPagesChange) {
                          if (e.target.checked) {
                            onSelectedPagesChange(['all'])
                          } else {
                            onSelectedPagesChange([])
                          }
                        }
                        setStylesApplied(false) // Reset when selection changes
                      }}
                      className="page-checkbox"
                    />
                    <span>All pages</span>
                  </label>
                  
                  {availablePages.map(page => {
                    // Normalize both page and currentPage for comparison
                    // Both should already be normalized from App.jsx, but normalize again to handle edge cases
                    const normalizePageName = (pageName) => {
                      if (!pageName) return ''
                      return String(pageName).replace('.html', '').replace(/[^a-zA-Z0-9]/g, '-').toLowerCase().trim()
                    }
                    
                    const pageId = normalizePageName(page)
                    const normalizedCurrentPage = normalizePageName(currentPage)
                    const isCurrentPage = pageId === normalizedCurrentPage && normalizedCurrentPage !== ''
                    
                    const isSelected = selectedPages.includes(page) || selectedPages.includes(pageId) || selectedPages.includes('all')
                    const isDisabled = selectedPages.includes('all') || isCurrentPage
                    
                    return (
                      <label key={pageId} className={`page-option ${isCurrentPage ? 'current-page' : ''}`}>
                        <input 
                          type="checkbox"
                          checked={isSelected}
                          disabled={isDisabled}
                          onChange={(e) => {
                            // Ignore onChange if this is a programmatic update (not user-initiated)
                            if (isProgrammaticUpdateRef.current) {
                              console.log('🔘 Ignoring programmatic checkbox update for:', pageId)
                              return
                            }
                            console.log('🔘 Page checkbox changed (user click):', pageId, e.target.checked)
                            if (onSelectedPagesChange) {
                              if (e.target.checked) {
                                // Add this page, remove 'all' if present
                                const newSelection = selectedPages.filter(p => p !== 'all')
                                onSelectedPagesChange([...newSelection, page])
                              } else {
                                // Remove this page (handle both with and without .html)
                                onSelectedPagesChange(selectedPages.filter(p => p !== page && p !== pageId))
                              }
                            }
                            setStylesApplied(false) // Reset when selection changes
                          }}
                          className="page-checkbox"
                        />
                        <span>
                          {pageId}
                          {isCurrentPage && <span className="current-badge"> (current/source)</span>}
                        </span>
                      </label>
                    )
                  })}
                </div>
                
                <span className="selection-info">
                  {selectedPages.length === 0 
                    ? `Current page only (${currentPage || 'index'})`
                    : selectedPages.includes('all') || selectedPages.length === availablePages.length
                      ? 'Applies to all pages'
                      : `Applies to ${selectedPages.length} page(s)`
                  }
                </span>
                
            {selectedPages.length > 0 && !selectedPages.includes('all') && (
              <button 
                className="clear-selection"
                onClick={async () => {
                  console.log('🗑️ Clear selection clicked')
                  console.log('Pages to clear:', selectedPages)
                  
                  setIsClearing(true)
                  
                  // Clear the styles from CSS AND uncheck the checkboxes
                  if (onClearAppliedStyles && element) {
                    console.log('🗑️ Removing CSS rules and clearing checkboxes for:', selectedPages)
                    const success = await onClearAppliedStyles(selectedPages)
                    
                    if (success !== false) {
                      // Clear the selection in UI - this unchecks the checkboxes
                      // The CSS rules have already been removed by onClearAppliedStyles
                      if (onSelectedPagesChange) {
                        onSelectedPagesChange([])
                      }
                      setStylesApplied(false)
                      console.log('✅ CSS rules removed and checkboxes unchecked')
                      
                      // Note: After clearing, when you navigate or click element again,
                      // detection will run and find no styles on those pages, so checkboxes will stay unchecked
                      
                      setTimeout(() => {
                        setIsClearing(false)
                      }, 1000)
                    } else {
                      console.warn('⚠️ Failed to remove CSS rules')
                      setIsClearing(false)
                    }
                  } else {
                    // Fallback: just clear selection if handler not available
                    if (onSelectedPagesChange) {
                      onSelectedPagesChange([])
                    }
                    setStylesApplied(false)
                    setIsClearing(false)
                  }
                }}
                disabled={isClearing}
              >
                {isClearing ? '🗑️ Clearing...' : 'Clear selection (remove from other pages)'}
              </button>
            )}
                
                {selectedPages.length > 0 && element && (
                  <div className="apply-button-container">
                    <button 
                      className={`apply-styles-btn ${stylesApplied ? 'applied' : ''}`}
                      onClick={async () => {
                        console.log('🔘 Apply button clicked')
                        if (onApplyCurrentStyles) {
                          const success = await onApplyCurrentStyles(selectedPages)
                          if (success) {
                            setStylesApplied(true)
                            // Reset after 2 seconds
                            setTimeout(() => setStylesApplied(false), 2000)
                          }
                        } else {
                          console.warn('⚠️ onApplyCurrentStyles is not available!')
                        }
                      }}
                      disabled={stylesApplied}
                    >
                      {stylesApplied ? '✓ Styles Applied & Saved!' : 'Apply current styles to selected pages'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        
        {/* Show child text elements if multiple, otherwise show single text content */}
        {childTextElements.length > 1 ? (
          <div className="property-group">
            <label className="property-label">Text Elements ({childTextElements.length})</label>
            {childTextElements.map((childEl, index) => (
              <div key={index} className="child-text-group">
                  <label className="child-text-label">
                  {getFriendlyElementName(childEl)}
                  </label>
                <textarea
                  value={childEl.textContent}
                  onChange={(e) => {
                    // Update the child element's text content
                    const updatedChildren = [...childTextElements];
                    updatedChildren[index] = { ...childEl, textContent: e.target.value };
                    setChildTextElements(updatedChildren);
                    
                    // Live updates for child text elements - use handleChildTextChange (not final)
                    handleChildTextChange(childEl, e.target.value, false);
                    
                    // Auto-resize textarea with max height
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                  }}
                  onBlur={(e) => {
                    // Final update on blur for child text elements
                    handleChildTextChange(childEl, e.target.value, true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.ctrlKey) {
                      handleChildTextChange(childEl, e.target.value, true); // Ctrl+Enter for immediate update
                    }
                  }}
                  className="property-input property-textarea child-text-input"
                  rows="1"
                  style={{ 
                    resize: 'none', 
                    overflow: 'hidden',
                    minHeight: 'var(--font-md)',
                    lineHeight: '1.4'
                  }}
                  />
                </div>
              ))}
          </div>
        ) : (
            <div className="property-group">
              <label className="property-label">Text Content</label>
            <textarea
              value={localTextContent}
              onChange={(e) => {
                setLocalTextContent(e.target.value);
                updateTextContentLive(e.target.value); // Live updates as you type
                // Auto-resize textarea
                e.target.style.height = 'auto';
                e.target.style.height = e.target.scrollHeight + 'px';
              }}
              onBlur={(e) => {
                updateTextContentFinal(e.target.value); // Final update on blur
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                  updateTextContentFinal(e.target.value); // Ctrl+Enter for immediate update
                }
              }}
              className="property-input property-textarea"
              rows="1"
              style={{ 
                resize: 'none', 
                overflow: 'hidden',
                minHeight: 'var(--font-md)',
                lineHeight: '1.4'
              }}
              />
            </div>
        )}
            
            {/* Show placeholder field for input elements */}
            {element && (element.tagName === 'input' || element.tagName === 'textarea') && (
              <div className="property-group">
                <label className="property-label">Placeholder Text</label>
                <input
                  type="text"
              value={localPlaceholder}
              onChange={(e) => {
                setLocalPlaceholder(e.target.value);
                handlePropertyChange('placeholder', e.target.value);
              }}
                  className="property-input"
                  placeholder="Enter placeholder text"
                />
              </div>
        )}

        <div className="property-group">
          <label className="property-label">Background Color</label>
          <div className="color-input-group">
          <input
            type="color"
            value={rgbToHex(properties.backgroundColor)}
            onChange={(e) => {
              console.log('Color picker changed:', e.target.value);
              handlePropertyChange('backgroundColor', e.target.value);
            }}
            className="color-picker"
          />
          <input
            type="text"
            value={properties.backgroundColor}
            onChange={(e) => {
              let colorValue = e.target.value.trim()
              // Ensure hex colors have # prefix
              if (colorValue && !colorValue.startsWith('#') && /^[0-9A-Fa-f]{6}$/.test(colorValue)) {
                colorValue = '#' + colorValue
              }
              console.log('Background color text changed:', e.target.value, '->', colorValue);
              handlePropertyChange('backgroundColor', colorValue);
            }}
            className="property-input"
          />
          </div>
        </div>

        <div className="property-group">
          <label className="property-label">Text Color</label>
          <div className="color-input-group">
            <input
              type="color"
              value={rgbToHex(properties.color)}
              onChange={(e) => handlePropertyChange('color', e.target.value)}
              className="color-picker"
            />
            <input
              type="text"
              value={properties.color}
              onChange={(e) => {
                let colorValue = e.target.value.trim()
                // Ensure hex colors have # prefix
                if (colorValue && !colorValue.startsWith('#') && /^[0-9A-Fa-f]{6}$/.test(colorValue)) {
                  colorValue = '#' + colorValue
                }
                handlePropertyChange('color', colorValue)
              }}
              className="property-input"
            />
          </div>
        </div>

        <div className="property-group property-group-row">
          <div className="property-item">
            <label className="property-label">Font Size</label>
            <input
              type="text"
              value={localFontSize || ''}
              onChange={(e) => {
                // Update local state only - no cursor jumping
                setLocalFontSize(e.target.value);
              }}
              onBlur={(e) => {
                // Commit the change when user is done editing
                let finalValue = e.target.value.trim() || properties.fontSize || '16px';
                
                // Ensure font-size has a unit (px, rem, em, %)
                if (finalValue && finalValue !== '') {
                  const hasUnit = /px|rem|em|%|pt|ex|ch|vw|vh|vmin|vmax/i.test(finalValue);
                  if (!hasUnit && /^\d+\.?\d*$/.test(finalValue)) {
                    // If it's just a number, add 'px' unit
                    finalValue = `${finalValue}px`;
                    console.log('🔧 Added missing unit to fontSize:', finalValue);
                  }
                } else {
                  finalValue = '16px'; // Default fallback
                }
                
                setLocalFontSize(finalValue);
                handlePropertyChange('fontSize', finalValue);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  // Commit on Enter key
                  e.target.blur();
                }
              }}
              className="property-input property-input-small"
              placeholder="e.g. 16px, 1.5rem, 120%"
            />
          </div>
        </div>

        <div className="property-group">
          <label className="property-label">Alignment</label>
          <div className="alignment-controls" style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => handlePropertyChange('textAlign', 'left')}
              className={properties.textAlign === 'left' ? 'alignment-btn active' : 'alignment-btn'}
              title="Left"
              style={{
                flex: 1,
                padding: '0.5rem',
                background: properties.textAlign === 'left' ? '#4a9eff' : '#2a2a2a',
                border: '1px solid #3a3a3a',
                borderRadius: '4px',
                color: properties.textAlign === 'left' ? '#fff' : '#e0e0e0',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: properties.textAlign === 'left' ? '600' : '400'
              }}
            >
              Left
            </button>
            <button
              type="button"
              onClick={() => handlePropertyChange('textAlign', 'center')}
              className={properties.textAlign === 'center' ? 'alignment-btn active' : 'alignment-btn'}
              title="Center"
              style={{
                flex: 1,
                padding: '0.5rem',
                background: properties.textAlign === 'center' ? '#4a9eff' : '#2a2a2a',
                border: '1px solid #3a3a3a',
                borderRadius: '4px',
                color: properties.textAlign === 'center' ? '#fff' : '#e0e0e0',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: properties.textAlign === 'center' ? '600' : '400'
              }}
            >
              Center
            </button>
            <button
              type="button"
              onClick={() => handlePropertyChange('textAlign', 'right')}
              className={properties.textAlign === 'right' ? 'alignment-btn active' : 'alignment-btn'}
              title="Right"
              style={{
                flex: 1,
                padding: '0.5rem',
                background: properties.textAlign === 'right' ? '#4a9eff' : '#2a2a2a',
                border: '1px solid #3a3a3a',
                borderRadius: '4px',
                color: properties.textAlign === 'right' ? '#fff' : '#e0e0e0',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: properties.textAlign === 'right' ? '600' : '400'
              }}
            >
              Right
            </button>
          </div>
        </div>

        <div className="property-group">
          <label className="property-label">Border</label>
          <div className="border-controls">
            <input
              type="number"
              placeholder="W"
              value={properties.borderWidth}
              onChange={(e) => handlePropertyChange('borderWidth', e.target.value)}
              className="property-input"
              title="Width"
            />
            <select
              value={properties.borderStyle}
              onChange={(e) => handlePropertyChange('borderStyle', e.target.value)}
              className="property-select"
            >
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
              <option value="none">None</option>
            </select>
            <input
              type="color"
              value={rgbToHex(properties.borderColor)}
              onChange={(e) => handlePropertyChange('borderColor', e.target.value)}
              className="color-picker-small"
            />
          </div>
        </div>

        <div className="property-group property-group-row">
          <div className="property-item">
            <label className="property-label">Width</label>
            <input
              type="text"
              value={properties.width}
              onChange={(e) => handlePropertyChange('width', e.target.value)}
              className="property-input property-input-small"
            />
          </div>
          <div className="property-item">
            <label className="property-label">Height</label>
            <input
              type="text"
              value={properties.height}
              onChange={(e) => handlePropertyChange('height', e.target.value)}
              className="property-input property-input-small"
            />
          </div>
        </div>

        <div className="property-group">
          <label className="property-label">Display</label>
          <select
            value={properties.display}
            onChange={(e) => handlePropertyChange('display', e.target.value)}
            className="property-select property-select-small"
          >
            <option value="block">Block</option>
            <option value="inline">Inline</option>
            <option value="inline-block">Inline Block</option>
            <option value="flex">Flex</option>
            <option value="grid">Grid</option>
            <option value="none">None</option>
          </select>
        </div>
        
        {/* Spacer to ensure last content is fully visible when scrolled */}
        <div style={{ height: '2rem', flexShrink: 0 }}></div>
      </div>
    </div>
  )
}

function rgbToHex(rgb) {
  if (rgb.startsWith('#')) return rgb
  if (rgb.startsWith('rgb')) {
    const match = rgb.match(/\d+/g)
    if (match && match.length >= 3) {
      return '#' + match.slice(0, 3).map(x => {
        const hex = parseInt(x).toString(16)
        return hex.length === 1 ? '0' + hex : hex
      }).join('')
    }
  }
  return '#000000'
}

export default PropertiesPanel

