import { useState, useEffect, useCallback } from 'react'
import './PropertiesPanel.css'

function PropertiesPanel({ element, onPropertyChange, isInspectorEnabled }) {
  const [properties, setProperties] = useState({
    textContent: '',
    placeholder: '',
    childTextElements: [],
    backgroundColor: '#ffffff',
    color: '#000000',
    fontSize: '16px',
    padding: { top: '0', right: '0', bottom: '0', left: '0' },
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
    borderWidth: '0',
    borderColor: '#000000',
    borderStyle: 'solid',
    borderRadius: '0',
    width: 'auto',
    height: 'auto',
    display: 'block'
  })

  // Function to extract child text elements
  const getChildTextElements = useCallback((element) => {
    if (!element || !element.tagName || !element.childNodes) {
      console.log('Invalid element passed to getChildTextElements:', element);
      return [];
    }
    
    const textElements = [];
    
      // Function to recursively find text-containing elements
      const findTextElements = (el, path = '') => {
        // Safety checks
        if (!el || !el.childNodes || !el.tagName) return;
        
        try {
          // Check if this element has direct text content (not just from children)
          const directText = Array.from(el.childNodes)
            .filter(node => node.nodeType === Node.TEXT_NODE)
            .map(node => node.textContent.trim())
            .filter(text => text.length > 0)
            .join(' ');
          
          // Also check if this is a leaf element with text content
          const isLeafWithText = el.children.length === 0 && el.textContent && el.textContent.trim().length > 0;
          
          if (directText || isLeafWithText) {
            const textToUse = directText || el.textContent.trim();
            textElements.push({
              element: el,
              text: textToUse,
              tagName: el.tagName,
              className: el.className || '',
              id: el.id || '',
              path: path || `${el.tagName}${el.id ? '#' + el.id : ''}${el.className ? '.' + el.className.split(' ')[0] : ''}`
            });
          }
          
          // Always check child elements for more text
          if (el.children) {
            Array.from(el.children).forEach((child, index) => {
              const childPath = `${path ? path + ' > ' : ''}${child.tagName}${child.id ? '#' + child.id : ''}${child.className ? '.' + child.className.split(' ')[0] : ''}`;
              findTextElements(child, childPath);
            });
          }
        } catch (error) {
          console.error('Error processing element in findTextElements:', error, el);
        }
      };
    
    try {
      findTextElements(element);
    } catch (error) {
      console.error('Error in getChildTextElements:', error, element);
    }
    
    return textElements;
  }, []);

  useEffect(() => {
    if (element) {
      // Use child text elements from the iframe if available, otherwise fallback to local detection
      const childTexts = element.childTextElements || [];
      
      console.log('PropertiesPanel received element with childTextElements:', childTexts);
      
      setProperties({
        textContent: element.textContent || '',
        placeholder: element.placeholder || '',
        childTextElements: childTexts,
        backgroundColor: element.styles?.backgroundColor || '#ffffff',
        color: element.styles?.color || '#000000',
        fontSize: element.styles?.fontSize || '16px',
        padding: parseSpacing(element.styles?.padding || '0'),
        margin: parseSpacing(element.styles?.margin || '0'),
        borderWidth: parseBorderWidth(element.styles?.border || '0'),
        borderColor: parseBorderColor(element.styles?.border || '#000000'),
        borderStyle: parseBorderStyle(element.styles?.border || 'solid'),
        borderRadius: element.styles?.borderRadius || '0',
        width: element.styles?.width || 'auto',
        height: element.styles?.height || 'auto',
        display: element.styles?.display || 'block'
      })
    }
  }, [element])

  const parseSpacing = (value) => {
    const parts = value.split(' ').map(v => v.replace('px', ''))
    return {
      top: parts[0] || '0',
      right: parts[1] || parts[0] || '0',
      bottom: parts[2] || parts[0] || '0',
      left: parts[3] || parts[1] || parts[0] || '0'
    }
  }

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

  const handleChildTextChange = (textElement, newValue) => {
    console.log('Updating child text:', { element: textElement, newValue });
    
    // Update the specific child element's text
    if (onPropertyChange) {
      onPropertyChange('childTextContent', {
        element: textElement,
        newText: newValue
      });
    }
    
    // Update local state
    setProperties(prev => ({
      ...prev,
      childTextElements: prev.childTextElements.map(el => 
        el === textElement ? { ...el, text: newValue } : el
      )
    }));
  };

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
    if (prop === 'padding' || prop === 'margin') {
      const spacing = typeof value === 'object' ? value : properties[prop]
      const spacingValue = `${spacing.top}px ${spacing.right}px ${spacing.bottom}px ${spacing.left}px`
      onPropertyChange(prop, spacingValue)
    } else if (prop === 'borderWidth' || prop === 'borderColor' || prop === 'borderStyle') {
      // Update all border properties together
      const borderValue = `${properties.borderWidth}px ${properties.borderStyle} ${properties.borderColor}`
      onPropertyChange('border', borderValue)
    } else {
      // Map to CSS property names
      const cssPropMap = {
        backgroundColor: 'backgroundColor',
        color: 'color',
        fontSize: 'fontSize',
        borderRadius: 'borderRadius',
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
        <div className="properties-header">
          <h3>Properties</h3>
        </div>
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

  return (
    <div className="properties-panel">
      <div className="properties-header">
        <h3>Properties</h3>
        <div className="element-info">
          <span className="element-tag">{element.tagName}</span>
          {element.id && <span className="element-id">#{element.id}</span>}
          {element.className && <span className="element-class">.{element.className.split(' ')[0]}</span>}
        </div>
      </div>
      
      <div className="properties-content">
        {/* Debug: Show what we found */}
        {console.log('Child text elements found:', properties.childTextElements)}
        
        {/* Show individual text elements if container has multiple text children */}
        {properties.childTextElements && properties.childTextElements.length > 0 ? (
          <div className="property-group">
            <label className="property-label">Text Contents</label>
            <div className="child-text-elements">
              {properties.childTextElements.map((textEl, index) => (
                <div key={index} className="child-text-item">
                  <label className="child-text-label">
                    {textEl.path}
                  </label>
                  <input
                    type="text"
                    value={textEl.text}
                    onChange={(e) => handleChildTextChange(textEl, e.target.value)}
                    className="property-input child-text-input"
                    placeholder={`Edit ${textEl.tagName} text`}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          // Show single text content for simple elements
          <>
            <div className="property-group">
              <label className="property-label">Text Content</label>
              <input
                type="text"
                value={properties.textContent}
                onChange={(e) => handlePropertyChange('textContent', e.target.value)}
                className="property-input"
              />
            </div>
            
            {/* Show placeholder field for input elements */}
            {element && (element.tagName === 'input' || element.tagName === 'textarea') && (
              <div className="property-group">
                <label className="property-label">Placeholder Text</label>
                <input
                  type="text"
                  value={properties.placeholder}
                  onChange={(e) => handlePropertyChange('placeholder', e.target.value)}
                  className="property-input"
                  placeholder="Enter placeholder text"
                />
              </div>
            )}
          </>
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
              console.log('Background color text changed:', e.target.value);
              handlePropertyChange('backgroundColor', e.target.value);
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
              onChange={(e) => handlePropertyChange('color', e.target.value)}
              className="property-input"
            />
          </div>
        </div>

        <div className="property-group property-group-row">
          <div className="property-item">
            <label className="property-label">Font Size</label>
            <input
              type="text"
              value={properties.fontSize}
              onChange={(e) => handlePropertyChange('fontSize', e.target.value)}
              className="property-input property-input-small"
            />
          </div>
          <div className="property-item">
            <label className="property-label">Border Radius</label>
            <input
              type="text"
              value={properties.borderRadius}
              onChange={(e) => handlePropertyChange('borderRadius', e.target.value)}
              className="property-input property-input-small"
            />
          </div>
        </div>

        <div className="property-group">
          <label className="property-label">Padding</label>
          <div className="spacing-controls">
            <input
              type="number"
              placeholder="T"
              value={properties.padding.top}
              onChange={(e) => handlePropertyChange('padding', { ...properties.padding, top: e.target.value })}
              className="spacing-input"
              title="Top"
            />
            <input
              type="number"
              placeholder="R"
              value={properties.padding.right}
              onChange={(e) => handlePropertyChange('padding', { ...properties.padding, right: e.target.value })}
              className="spacing-input"
              title="Right"
            />
            <input
              type="number"
              placeholder="B"
              value={properties.padding.bottom}
              onChange={(e) => handlePropertyChange('padding', { ...properties.padding, bottom: e.target.value })}
              className="spacing-input"
              title="Bottom"
            />
            <input
              type="number"
              placeholder="L"
              value={properties.padding.left}
              onChange={(e) => handlePropertyChange('padding', { ...properties.padding, left: e.target.value })}
              className="spacing-input"
              title="Left"
            />
          </div>
        </div>

        <div className="property-group">
          <label className="property-label">Margin</label>
          <div className="spacing-controls">
            <input
              type="number"
              placeholder="T"
              value={properties.margin.top}
              onChange={(e) => handlePropertyChange('margin', { ...properties.margin, top: e.target.value })}
              className="spacing-input"
              title="Top"
            />
            <input
              type="number"
              placeholder="R"
              value={properties.margin.right}
              onChange={(e) => handlePropertyChange('margin', { ...properties.margin, right: e.target.value })}
              className="spacing-input"
              title="Right"
            />
            <input
              type="number"
              placeholder="B"
              value={properties.margin.bottom}
              onChange={(e) => handlePropertyChange('margin', { ...properties.margin, bottom: e.target.value })}
              className="spacing-input"
              title="Bottom"
            />
            <input
              type="number"
              placeholder="L"
              value={properties.margin.left}
              onChange={(e) => handlePropertyChange('margin', { ...properties.margin, left: e.target.value })}
              className="spacing-input"
              title="Left"
            />
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

