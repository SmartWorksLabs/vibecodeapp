import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react'
import './PreviewPane.css'

const PreviewPane = forwardRef(({ files, selectedFile, selectedElement, onElementSelect, onInspectorToggle, isInspectorEnabled }, ref) => {
  const iframeRef = useRef(null)
  const [isInspecting, setIsInspecting] = useState(() => {
    console.log('PreviewPane: Initializing isInspecting state with isInspectorEnabled:', isInspectorEnabled)
    return isInspectorEnabled ?? true
  })
  const selectedElementRef = useRef(null)
  const scrollPositionRef = useRef({ x: 0, y: 0 })
  const currentInspectorStateRef = useRef(isInspecting)
  const currentParentInspectorStateRef = useRef(isInspectorEnabled)

  // Keep refs updated with current state values
  useEffect(() => {
    currentInspectorStateRef.current = isInspecting
  }, [isInspecting])

  useEffect(() => {
    currentParentInspectorStateRef.current = isInspectorEnabled
  }, [isInspectorEnabled])

  // Sync local state with parent state
  useEffect(() => {
    console.log('PreviewPane: Parent isInspectorEnabled changed to:', isInspectorEnabled, 'local isInspecting:', isInspecting)
    if (isInspectorEnabled !== undefined && isInspectorEnabled !== isInspecting) {
      console.log('PreviewPane: Syncing local state from parent:', isInspectorEnabled)
      setIsInspecting(isInspectorEnabled)
    }
  }, [isInspectorEnabled, isInspecting])

  // Send inspector state to iframe when it changes
  useEffect(() => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        type: 'SET_INSPECTOR_MODE',
        isInspecting: isInspecting
      }, '*');
    }
  }, [isInspecting]);

  useImperativeHandle(ref, () => ({
    updateElementStyle: (property, value) => {
      console.log('PreviewPane.updateElementStyle called:', { property, value });
      
      if (iframeRef.current?.contentWindow) {
        console.log('Sending UPDATE_STYLE message to iframe');
        iframeRef.current.contentWindow.postMessage({
          type: 'UPDATE_STYLE',
          property: property,
          value: value
        }, '*');
      } else {
        console.warn('No iframe contentWindow available for style update');
      }
    }
  }))

  useEffect(() => {
    if (!iframeRef.current || !files) return

    // Use selected HTML file if it's an HTML file, otherwise fall back to index.html or first HTML
    let htmlFile = null
    if (selectedFile && selectedFile.type === 'html') {
      console.log('PreviewPane: Using selected HTML file:', selectedFile.name)
      htmlFile = selectedFile
    } else {
      if (selectedFile && selectedFile.type !== 'html') {
        console.log('PreviewPane: Selected file is not HTML (type:', selectedFile.type, '), falling back to index.html')
      }
      htmlFile = files.find(f => f.name === 'index.html') || files.find(f => f.type === 'html')
      console.log('PreviewPane: Using fallback HTML file:', htmlFile?.name)
    }
    
    if (!htmlFile) return

    const cssFiles = files.filter(f => f.type === 'css')
    const jsFiles = files.filter(f => f.type === 'js')

    console.log('PreviewPane: Processing files', {
      htmlFile: htmlFile.name,
      cssFiles: cssFiles.map(f => ({ name: f.name, contentLength: f.content?.length })),
      jsFiles: jsFiles.map(f => f.name)
    })

    // Build HTML with embedded CSS and JS
    let htmlContent = htmlFile.content
    
    // Get image files for processing
    const imageFiles = files.filter(f => f.isImage)

    // Ensure viewport meta tag is set for desktop rendering
    if (!htmlContent.includes('viewport')) {
      const viewportMeta = '<meta name="viewport" content="width=1200, initial-scale=1.0">'
      if (htmlContent.includes('</head>')) {
        htmlContent = htmlContent.replace('</head>', `${viewportMeta}</head>`)
      } else if (htmlContent.includes('<head>')) {
        htmlContent = htmlContent.replace('<head>', `<head>${viewportMeta}`)
      } else {
        htmlContent = `${viewportMeta}${htmlContent}`
      }
    } else {
      // Update existing viewport to desktop width
      htmlContent = htmlContent.replace(
        /<meta[^>]*name=["']viewport["'][^>]*>/gi,
        '<meta name="viewport" content="width=1200, initial-scale=1.0">'
      )
    }

    // Remove all CSS link tags (they won't work with blob URLs anyway)
    // More comprehensive pattern to catch all link tag variations
    const linkTagPatterns = [
      /<link[^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi,
      /<link[^>]*rel\s*=\s*["']stylesheet["'][^>]*\/?>/gi,
      /<link[^>]*type\s*=\s*["']text\/css["'][^>]*>/gi,
      /<link[^>]*href\s*=\s*["'][^"']*\.css["'][^>]*>/gi
    ]
    
    linkTagPatterns.forEach(pattern => {
      htmlContent = htmlContent.replace(pattern, '')
    })

    // Inject ALL CSS files as inline <style> tags
    // This ensures all CSS is always loaded, regardless of link tag matching
    if (cssFiles.length > 0) {
      const cssTagsToInject = cssFiles
        .filter(cssFile => {
          const hasContent = cssFile.content && cssFile.content.trim()
          if (!hasContent) {
            console.warn(`CSS file ${cssFile.name} has no content`)
          }
          return hasContent
        })
        .map(cssFile => {
          console.log(`Injecting CSS from ${cssFile.name} (${cssFile.content.length} chars)`)
          return `<style id="injected-${cssFile.name}">${cssFile.content}</style>`
        })
        .join('\n')
      
      console.log(`Injecting ${cssFiles.length} CSS file(s) into HTML`)
      
      // Inject CSS at the start of <head> for proper cascade order
      if (htmlContent.includes('<head>')) {
        // Insert right after <head> tag (only first occurrence)
        htmlContent = htmlContent.replace(/<head>/i, `<head>\n${cssTagsToInject}\n`)
      } else if (htmlContent.includes('</head>')) {
        // Insert before </head> if <head> tag exists but we can't find opening
        htmlContent = htmlContent.replace(/<\/head>/i, `${cssTagsToInject}\n</head>`)
      } else if (htmlContent.includes('<body>')) {
        // Fallback: inject before body
        htmlContent = htmlContent.replace(/<body>/i, `${cssTagsToInject}\n<body>`)
      } else {
        // Last resort: prepend to document
        htmlContent = `${cssTagsToInject}\n${htmlContent}`
      }
    } else {
      console.warn('No CSS files found to inject')
    }

    // Replace <script src> tags for JS files with inline <script> tags
    jsFiles.forEach(jsFile => {
      const fileName = jsFile.name
      const baseFileName = fileName.replace('.js', '')
      
      let replaced = false
      
      // Find all script tags with src attribute
      const scriptTagPattern = /<script[^>]*src=["'][^"']+["'][^>]*><\/script>/gi
      htmlContent = htmlContent.replace(scriptTagPattern, (match) => {
        // Extract src value
        const srcMatch = match.match(/src=["']([^"']+)["']/i)
        if (srcMatch) {
          const src = srcMatch[1]
          // Check if src ends with our filename or contains it
          const srcFileName = src.split('/').pop().split('?')[0] // Get filename from path, remove query params
          
          if (srcFileName === fileName || srcFileName === baseFileName || src.includes(fileName) || src.includes(baseFileName)) {
            replaced = true
            return `<script id="injected-${jsFile.name}">${jsFile.content}</script>`
          }
        }
        return match
      })

      // If no script tag was found, inject the JS as a new script tag
      if (!replaced) {
        const scriptTag = `<script id="injected-${jsFile.name}">${jsFile.content}</script>`
        if (htmlContent.includes('</body>')) {
          htmlContent = htmlContent.replace('</body>', `${scriptTag}</body>`)
        } else if (htmlContent.includes('<body>')) {
          htmlContent = htmlContent.replace('<body>', `<body>${scriptTag}`)
        } else {
          htmlContent = `${htmlContent}${scriptTag}`
        }
      }
    })

    // Replace image src attributes with data URLs
    if (imageFiles.length > 0) {
      console.log('Processing images:', imageFiles.map(f => f.name));
      
      imageFiles.forEach(imageFile => {
        const imageName = imageFile.name;
        const imageDataUrl = imageFile.dataUrl;
        
        // Replace various possible image references
        const patterns = [
          new RegExp(`src=["']([^"']*${imageName})["']`, 'gi'),
          new RegExp(`src=["'](\\.?/?images?/${imageName})["']`, 'gi'),
          new RegExp(`src=["'](\\.?/?assets?/${imageName})["']`, 'gi'),
          new RegExp(`src=["'](\\.?/?${imageName})["']`, 'gi')
        ];
        
        patterns.forEach(pattern => {
          htmlContent = htmlContent.replace(pattern, `src="${imageDataUrl}"`);
        });
        
        console.log(`Replaced image references for: ${imageName}`);
      });
    }

    // Inject inspector script
    const inspectorScript = `
      <script>
        (function() {
          let selectedElement = null;
          let highlightDiv = null;
          
          function createHighlight() {
            if (highlightDiv) return;
            highlightDiv = document.createElement('div');
            highlightDiv.id = 'vibecanvas-highlight';
            highlightDiv.style.position = 'absolute';
            highlightDiv.style.border = '2px solid #4a9eff';
            highlightDiv.style.pointerEvents = 'none';
            highlightDiv.style.zIndex = '999999';
            highlightDiv.style.boxSizing = 'border-box';
            highlightDiv.style.transition = 'none';
            document.body.appendChild(highlightDiv);
          }
          
          function highlightElement(element) {
            if (!element || element === document.body || element === document.documentElement) {
              if (highlightDiv && !selectedElement) {
                highlightDiv.style.display = 'none';
              }
              return;
            }
            
            if (!highlightDiv) createHighlight();
            
            try {
              // Save scroll position before getting rect (in case it triggers scroll)
              const savedScrollX = window.scrollX || window.pageXOffset;
              const savedScrollY = window.scrollY || window.pageYOffset;
              
              const rect = element.getBoundingClientRect();
              
              // Restore scroll position immediately after getting rect
              window.scrollTo(savedScrollX, savedScrollY);
              
              // Always show highlight, even for zero-size elements
              highlightDiv.style.display = 'block';
              highlightDiv.style.visibility = 'visible';
              highlightDiv.style.opacity = '1';
              
              if (rect.width === 0 && rect.height === 0) {
                // For hidden/zero-size elements, show a minimum 2x2 highlight
                highlightDiv.style.left = (rect.left + savedScrollX) + 'px';
                highlightDiv.style.top = (rect.top + savedScrollY) + 'px';
                highlightDiv.style.width = '2px';
                highlightDiv.style.height = '2px';
              } else if (rect.width < 2 || rect.height < 2) {
                // For very small elements, ensure minimum visibility
                highlightDiv.style.left = (rect.left + savedScrollX) + 'px';
                highlightDiv.style.top = (rect.top + savedScrollY) + 'px';
                highlightDiv.style.width = Math.max(rect.width, 2) + 'px';
                highlightDiv.style.height = Math.max(rect.height, 2) + 'px';
              } else {
                // Normal elements
                highlightDiv.style.left = (rect.left + savedScrollX) + 'px';
                highlightDiv.style.top = (rect.top + savedScrollY) + 'px';
                highlightDiv.style.width = rect.width + 'px';
                highlightDiv.style.height = rect.height + 'px';
              }
              
              // Only log when element changes, not every frame
              if (!window.lastHighlightedElement || window.lastHighlightedElement !== element) {
                console.log('Highlighting element:', {
                  tagName: element.tagName,
                  id: element.id,
                  className: element.className,
                  textContent: element.textContent?.substring(0, 30),
                  rect: rect,
                  highlightPos: {
                    left: highlightDiv.style.left,
                    top: highlightDiv.style.top,
                    width: highlightDiv.style.width,
                    height: highlightDiv.style.height
                  }
                });
                window.lastHighlightedElement = element;
              }
              
            } catch (e) {
              console.error('Error highlighting element:', e);
              // Element might have been removed, hide highlight only if no selection
              if (!selectedElement && highlightDiv) {
                highlightDiv.style.display = 'none';
              }
            }
          }
          
          function getElementInfo(element) {
            if (!element) return null;
            
            const computedStyle = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            
            // Extract child text elements for multi-text editing
            const childTextElements = [];
            
            function findTextElements(el, path = '') {
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
                  
                  // Check if element is visually hidden
                  const isHidden = isElementHidden(el);
                  
                  if (textToUse.length > 0 && !isHidden) {
                    childTextElements.push({
                      text: textToUse,
                      tagName: el.tagName,
                      className: el.className || '',
                      id: el.id || '',
                      path: path || el.tagName + (el.id ? '#' + el.id : '') + (el.className ? '.' + el.className.split(' ')[0] : '')
                    });
                  }
                }
                
                // Always check child elements for more text
                if (el.children) {
                  Array.from(el.children).forEach((child, index) => {
                    const childPath = (path ? path + ' > ' : '') + child.tagName + (child.id ? '#' + child.id : '') + (child.className ? '.' + child.className.split(' ')[0] : '');
                    findTextElements(child, childPath);
                  });
                }
              } catch (error) {
                console.error('Error processing element in findTextElements:', error, el);
              }
            }
            
            // Helper function to check if element is visually hidden
            function isElementHidden(el) {
              if (!el) return true;
              
              const computedStyle = window.getComputedStyle(el);
              const rect = el.getBoundingClientRect();
              
              // Check for common hiding methods
              const isDisplayNone = computedStyle.display === 'none';
              const isVisibilityHidden = computedStyle.visibility === 'hidden';
              const isOpacityZero = computedStyle.opacity === '0';
              const isZeroSize = rect.width === 0 && rect.height === 0;
              const isOffScreen = rect.left < -1000 || rect.top < -1000;
              
              // Check for screen reader only classes
              const className = el.className || '';
              const isSrOnly = className.includes('sr-only') || 
                              className.includes('screen-reader-only') || 
                              className.includes('visually-hidden') ||
                              className.includes('hidden');
              
              // Check for hidden attribute
              const hasHiddenAttr = el.hasAttribute('hidden');
              
              return isDisplayNone || isVisibilityHidden || isOpacityZero || 
                     isZeroSize || isOffScreen || isSrOnly || hasHiddenAttr;
            }
            
            // Find all text elements within this element
            findTextElements(element);
            
            console.log('Found child text elements in iframe (visible only):', childTextElements);
            
            return {
              tagName: element.tagName.toLowerCase(),
              id: element.id || '',
              className: element.className || '',
              textContent: element.textContent?.trim().substring(0, 50) || '',
              placeholder: element.placeholder || '', // Add placeholder support
              childTextElements: childTextElements, // Add this to the element info
              styles: {
                backgroundColor: computedStyle.backgroundColor,
                color: computedStyle.color,
                fontSize: computedStyle.fontSize,
                padding: computedStyle.padding,
                margin: computedStyle.margin,
                border: computedStyle.border,
                borderRadius: computedStyle.borderRadius,
                width: computedStyle.width,
                height: computedStyle.height,
                display: computedStyle.display
              },
              rect: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
              }
            };
          }
          
          // Prevent all automatic scrolling
          const originalScrollIntoView = Element.prototype.scrollIntoView;
          const originalFocus = HTMLElement.prototype.focus;
          
          Element.prototype.scrollIntoView = function() {
            // Do nothing - prevent all scrollIntoView calls
          };
          
          HTMLElement.prototype.focus = function() {
            // Prevent focus from scrolling
            const scrollX = window.scrollX || window.pageXOffset;
            const scrollY = window.scrollY || window.pageYOffset;
            originalFocus.call(this);
            window.scrollTo(scrollX, scrollY);
          };
          
          // Inspector mode state
          let inspectorEnabled = true;

          document.addEventListener('click', function(e) {
            // If inspector is disabled, allow normal behavior
            if (!inspectorEnabled) {
              // For links, we need to handle navigation within the iframe context
              if (e.target.tagName === 'A' && e.target.href) {
                e.preventDefault();
                const href = e.target.getAttribute('href');
                if (href && !href.startsWith('http') && !href.startsWith('//')) {
                  // Internal navigation - notify parent to load the new page
                  window.parent.postMessage({
                    type: 'NAVIGATE_TO_PAGE',
                    href: href
                  }, '*');
                }
                return;
              }
              return; // Let other clicks work normally
            }

            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            
            // Don't select if clicking on the highlight itself
            if (e.target === highlightDiv) return;
            
            // Prevent input fields from getting focus when in inspector mode
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
              e.target.blur(); // Remove focus immediately
            }
            
            // Save scroll position before selection
            const scrollX = window.scrollX || window.pageXOffset;
            const scrollY = window.scrollY || window.pageYOffset;
            
            // Get the element at the exact click coordinates to avoid bubbling issues
            const clickX = e.clientX;
            const clickY = e.clientY;
            
            // Temporarily hide highlight to get accurate elementFromPoint
            if (highlightDiv) {
              highlightDiv.style.display = 'none';
            }
            
            // Get the actual element at the click point
            let targetElement = document.elementFromPoint(clickX, clickY);
            
            // Restore highlight display
            if (highlightDiv) {
              highlightDiv.style.display = 'block';
            }
            
            // Fallback to event target if elementFromPoint fails
            if (!targetElement) {
              targetElement = e.target;
            }
            
            // NEW: If elementFromPoint and event target are different, prefer the event target
            // This handles cases where CSS transforms or positioning cause issues
            if (targetElement !== e.target && e.target !== document.body && e.target !== document.documentElement) {
              // Check if the event target is actually clickable/meaningful
              const eventTargetRect = e.target.getBoundingClientRect();
              if (eventTargetRect.width > 0 && eventTargetRect.height > 0) {
                targetElement = e.target;
              }
            }
            
            // If we clicked on a text node, get its parent
            if (targetElement.nodeType === Node.TEXT_NODE) {
              targetElement = targetElement.parentElement;
            }
            
            // Skip if we somehow got body or html
            if (targetElement === document.body || targetElement === document.documentElement) {
              return;
            }
            
            // Additional check: if the element is very small or has no meaningful content,
            // try to find a more appropriate parent
            const rect = targetElement.getBoundingClientRect();
            if (rect.width < 5 && rect.height < 5 && targetElement.parentElement) {
              const parentRect = targetElement.parentElement.getBoundingClientRect();
              // If parent is much larger and contains our click point, use parent
              if (parentRect.width > rect.width * 2 && parentRect.height > rect.height * 2 &&
                  clickX >= parentRect.left && clickX <= parentRect.right &&
                  clickY >= parentRect.top && clickY <= parentRect.bottom) {
                targetElement = targetElement.parentElement;
              }
            }
            
            selectedElement = targetElement;
            
            // Store a permanent reference to prevent it from changing
            window.currentSelectedElement = selectedElement;
            
            // Create a unique identifier for this specific element to prevent confusion
            if (!selectedElement.dataset.vibecanvasId) {
              selectedElement.dataset.vibecanvasId = 'selected-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
            }
            window.currentSelectedElementId = selectedElement.dataset.vibecanvasId;
            
            createHighlight();
            highlightElement(selectedElement);
            
            // Immediately restore scroll position - no delays
            window.scrollTo(scrollX, scrollY);
            
            // Force highlight to stay visible
            if (highlightDiv) {
              highlightDiv.style.display = 'block';
              highlightDiv.style.visibility = 'visible';
            }
            
            console.log('LOCKED SELECTION to:', {
              tagName: selectedElement.tagName,
              id: selectedElement.id,
              className: selectedElement.className,
              textContent: selectedElement.textContent?.substring(0, 30),
              rect: selectedElement.getBoundingClientRect()
            });
            
            const info = getElementInfo(selectedElement);
            // Store element reference for style updates
            window.selectedElementRef = selectedElement;
            window.selectedElementInfo = info;
            
            console.log('=== CLICK DEBUG ===');
            console.log('Click coordinates:', { x: clickX, y: clickY });
            console.log('Event target:', {
              tagName: e.target.tagName,
              id: e.target.id,
              className: e.target.className,
              textContent: e.target.textContent?.substring(0, 30)
            });
            console.log('ElementFromPoint result:', {
              tagName: targetElement.tagName,
              id: targetElement.id,
              className: targetElement.className,
              textContent: targetElement.textContent?.substring(0, 30)
            });
            console.log('Final selected element:', {
              tagName: selectedElement.tagName,
              id: selectedElement.id,
              className: selectedElement.className,
              textContent: selectedElement.textContent?.substring(0, 30)
            });
            
            // Simplified logging to avoid [object Object] issues
            console.log('Elements with same text content: ' + 
              Array.from(document.querySelectorAll('*')).filter(el => 
                el.textContent?.trim() === selectedElement.textContent?.trim() && 
                el.textContent?.trim().length > 0
              ).length + ' elements found');
            
            window.parent.postMessage({
              type: 'ELEMENT_SELECTED',
              element: info
            }, '*');
          }, true);
          
          // Keep selected element highlighted - this is critical!
          function maintainSelection() {
            if (selectedElement && highlightDiv) {
              try {
                // CRITICAL: Always use the locked reference, never trust selectedElement variable
                let elementToHighlight = window.currentSelectedElement;
                
                // Double-check the element still exists and has the right ID
                if (elementToHighlight && 
                    document.contains(elementToHighlight) &&
                    window.currentSelectedElementId &&
                    elementToHighlight.dataset.vibecanvasId === window.currentSelectedElementId) {
                  
                  // Force selectedElement to match our locked reference
                  selectedElement = elementToHighlight;
                  highlightElement(elementToHighlight);
                  
                  // Force visibility
                  highlightDiv.style.display = 'block';
                  highlightDiv.style.visibility = 'visible';
                  highlightDiv.style.opacity = '1';
                  
                } else {
                  // Try to find the element by unique ID if reference is lost
                  if (window.currentSelectedElementId) {
                    const selector = '[data-vibecanvas-id="' + window.currentSelectedElementId + '"]';
                    const foundElement = document.querySelector(selector);
                    if (foundElement) {
                      selectedElement = foundElement;
                      window.currentSelectedElement = foundElement;
                      highlightElement(foundElement);
                      highlightDiv.style.display = 'block';
                      highlightDiv.style.visibility = 'visible';
                      highlightDiv.style.opacity = '1';
                      console.log('Restored selection by unique ID');
                    }
                  }
                }
              } catch (e) {
                console.error('Error maintaining selection:', e);
              }
            } else if (!selectedElement && highlightDiv) {
              // Only hide if no element is selected
              highlightDiv.style.display = 'none';
            }
          }
          
          // Update highlight on scroll or resize (but don't prevent scrolling)
          window.addEventListener('scroll', function() {
            maintainSelection();
          }, { passive: true });
          
          window.addEventListener('resize', maintainSelection);
          
          // Periodically check if element is still in view and update highlight
          // Use requestAnimationFrame for smoother updates, but throttle it
          let lastMaintainTime = 0;
          function animateSelection() {
            const now = Date.now();
            if (now - lastMaintainTime > 50) { // More frequent checks after updates
              // Use the stored reference to prevent element switching
              if (window.currentSelectedElement && selectedElement !== window.currentSelectedElement) {
                // Double-check using unique ID to prevent false positives
                if (window.currentSelectedElementId && 
                    selectedElement.dataset.vibecanvasId !== window.currentSelectedElementId) {
                  console.warn('Selection drift detected! Restoring original selection.');
                  selectedElement = window.currentSelectedElement;
                }
              }
              
              // Also check if our selected element still exists in DOM
              if (selectedElement && !document.contains(selectedElement)) {
                console.warn('Selected element removed from DOM! Trying to find replacement...');
                // Try to find element by unique ID
                if (window.currentSelectedElementId) {
                  const selector = '[data-vibecanvas-id="' + window.currentSelectedElementId + '"]';
                  const replacement = document.querySelector(selector);
                  if (replacement) {
                    selectedElement = replacement;
                    window.currentSelectedElement = replacement;
                    console.log('Found replacement element:', replacement);
                  }
                }
              }
              
              maintainSelection();
              lastMaintainTime = now;
            }
            requestAnimationFrame(animateSelection);
          }
          animateSelection();
          
          // Also update on any DOM mutations (in case element moves)
          const observer = new MutationObserver(() => {
            if (selectedElement) {
              maintainSelection();
            }
          });
          observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class']
          });
          
          let hoverTimeout = null;
          document.addEventListener('mousemove', function(e) {
            if (!highlightDiv || !inspectorEnabled) return;
            
            // Clear any pending hover timeout
            if (hoverTimeout) {
              clearTimeout(hoverTimeout);
            }
            
            // Always maintain selected element highlight if one exists
            if (window.currentSelectedElement) {
              // Force highlight on the locked element, ignore mousemove
              highlightElement(window.currentSelectedElement);
              return;
            }
            
            // Only show hover highlight if nothing is selected
            if (!selectedElement) {
              hoverTimeout = setTimeout(() => {
                // Temporarily hide highlight to get accurate elementFromPoint
                const wasVisible = highlightDiv.style.display !== 'none';
                if (wasVisible) {
                  highlightDiv.style.display = 'none';
                }
                
                const element = document.elementFromPoint(e.clientX, e.clientY);
                
                // Restore highlight if it was visible
                if (wasVisible) {
                  highlightDiv.style.display = 'block';
                }
                
                if (element && element !== document.body && element !== document.documentElement && 
                    element !== selectedElement && element !== highlightDiv) {
                  highlightElement(element);
                }
              }, 50);
            }
          });
          
          window.addEventListener('message', function(e) {
            console.log('Iframe received message:', e.data);
            
            if (e.data.type === 'UPDATE_STYLE') {
              // Use the currently selected element with unique ID verification
              let targetElement = selectedElement;
              
              // Double-check we have the right element
              if (window.currentSelectedElementId && 
                  targetElement && 
                  targetElement.dataset.vibecanvasId !== window.currentSelectedElementId) {
                targetElement = window.currentSelectedElement;
              }
              
              if (targetElement) {
                console.log('Applying style update:', {
                  property: e.data.property,
                  value: e.data.value,
                  element: {
                    tag: targetElement.tagName,
                    id: targetElement.id,
                    class: targetElement.className,
                    text: targetElement.textContent?.substring(0, 30)
                  }
                });
                
                // Handle child text content updates
                if (e.data.property === 'childTextContent') {
                  console.log('Updating child text content:', e.data.value);
                  const { element: childInfo, newText } = e.data.value;
                  
                  // Find the specific child element to update
                  const childElement = Array.from(targetElement.querySelectorAll('*')).find(el => {
                    return el.tagName === childInfo.tagName.toUpperCase() &&
                           el.className === childInfo.className &&
                           el.id === childInfo.id;
                  });
                  
                  if (childElement) {
                    // Update only the direct text nodes, not nested elements
                    Array.from(childElement.childNodes).forEach(node => {
                      if (node.nodeType === Node.TEXT_NODE) {
                        node.textContent = newText;
                      }
                    });
                    console.log('Updated child element text:', childElement);
                  }
                  
                } else if (e.data.property === 'placeholder') {
                  console.log('Updating placeholder to:', e.data.value);
                  if (targetElement.tagName === 'INPUT' || targetElement.tagName === 'TEXTAREA') {
                    targetElement.placeholder = e.data.value;
                  }
                  
                } else if (e.data.property === 'textContent') {
                  console.log('Updating text content to:', e.data.value);
                  targetElement.textContent = e.data.value;
                  
                  // CRITICAL: Re-establish selection after text change
                  selectedElement = targetElement;
                  window.currentSelectedElement = targetElement;
                  if (!targetElement.dataset.vibecanvasId) {
                    targetElement.dataset.vibecanvasId = 'selected-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
                  }
                  window.currentSelectedElementId = targetElement.dataset.vibecanvasId;
                  
                } else {
                  // Convert property name to camelCase for inline styles
                  const styleProperty = e.data.property.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
                  
                  // Apply the style change
                  targetElement.style[styleProperty] = e.data.value;
                  
                  console.log('Style applied. Element now has:', {
                    property: styleProperty,
                    value: targetElement.style[styleProperty],
                    computedStyle: window.getComputedStyle(targetElement)[styleProperty]
                  });
                  
                  // CRITICAL: Re-establish selection after style change
                  selectedElement = targetElement;
                  window.currentSelectedElement = targetElement;
                }
                
                // Force highlight update after any change
                highlightElement(targetElement);
                
                console.log('Selection re-established after update:', {
                  tag: targetElement.tagName,
                  id: targetElement.id,
                  class: targetElement.className,
                  uniqueId: targetElement.dataset.vibecanvasId
                });
                
                const info = getElementInfo(targetElement);
                window.selectedElementInfo = info;
                
                window.parent.postMessage({
                  type: 'ELEMENT_UPDATED',
                  element: info
                }, '*');
              } else {
                console.warn('No target element found for style update');
              }
            } else if (e.data.type === 'SET_INSPECTOR_MODE') {
              console.log('Setting inspector mode:', e.data.isInspecting);
              inspectorEnabled = e.data.isInspecting;
              
              // Hide/show highlight based on inspector mode
              if (!inspectorEnabled && highlightDiv) {
                highlightDiv.style.display = 'none';
                selectedElement = null;
                window.currentSelectedElement = null;
                window.currentSelectedElementId = null;
              }
              
            } else if (e.data.type === 'SELECT_ELEMENT') {
              // Re-select element when iframe reloads
              const elementInfo = e.data.element;
              if (elementInfo) {
                // Try to find the element by tag, id, or class
                let foundElement = null;
                if (elementInfo.id) {
                  foundElement = document.getElementById(elementInfo.id);
                } else if (elementInfo.className) {
                  const className = elementInfo.className.split(' ')[0];
                  foundElement = document.querySelector('.' + className);
                }
                
                if (foundElement) {
                  selectedElement = foundElement;
                  window.selectedElementRef = foundElement;
                  window.currentSelectedElement = foundElement;
                  highlightElement(selectedElement);
                } else {
                  // Fallback: try to find by tag name and position
                  const elements = document.querySelectorAll(elementInfo.tagName);
                  if (elements.length > 0) {
                    selectedElement = elements[0];
                    window.selectedElementRef = selectedElement;
                    window.currentSelectedElement = selectedElement;
                    highlightElement(selectedElement);
                  }
                }
              }
            }
          });
        })();
      </script>
    `

    htmlContent = htmlContent.replace('</body>', `${inspectorScript}</body>`)

    // Debug: Log final HTML to verify CSS is included
    const hasStyleTags = htmlContent.includes('<style')
    const styleTagCount = (htmlContent.match(/<style/g) || []).length
    console.log('Final HTML check:', {
      hasStyleTags,
      styleTagCount,
      htmlLength: htmlContent.length,
      first500Chars: htmlContent.substring(0, 500)
    })

    const blob = new Blob([htmlContent], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    
    // Save scroll position before reload
    const iframe = iframeRef.current
    if (iframe?.contentWindow) {
      try {
        scrollPositionRef.current = {
          x: iframe.contentWindow.scrollX || iframe.contentWindow.pageXOffset || 0,
          y: iframe.contentWindow.scrollY || iframe.contentWindow.pageYOffset || 0
        }
      } catch (e) {
        // Cross-origin or not loaded yet
      }
    }
    
    // Clean up old URL if it exists
    if (iframe?.dataset.blobUrl) {
      URL.revokeObjectURL(iframe.dataset.blobUrl)
    }
    if (iframe) {
      iframe.dataset.blobUrl = url
      iframe.src = url
    }

    // Listen for messages from iframe
    const handleMessage = (event) => {
      if (event.data.type === 'ELEMENT_SELECTED') {
        selectedElementRef.current = event.data.element
        onElementSelect(event.data.element)
      } else if (event.data.type === 'ELEMENT_UPDATED') {
        selectedElementRef.current = event.data.element
        onElementSelect(event.data.element)
      } else if (event.data.type === 'NAVIGATE_TO_PAGE') {
        console.log('PreviewPane received navigation request:', event.data.href)
        // Find the target HTML file
        const targetFile = files.find(f => f.name === event.data.href || f.path === event.data.href || f.name.endsWith(event.data.href))
        if (targetFile && targetFile.type === 'html') {
          console.log('Found target file:', targetFile.name)
          console.log('Current state during navigation - isInspecting:', currentInspectorStateRef.current, 'isInspectorEnabled:', currentParentInspectorStateRef.current)
          // We need to trigger a re-render by updating the selectedFile in the parent
          // For now, let's just reload the iframe with the new file
          loadHTMLIntoIframe(targetFile)
        } else {
          console.warn('Could not find HTML file for navigation:', event.data.href)
        }
      } else if (event.data.type === 'REQUEST_INSPECTOR_STATE') {
        console.log('=== INSPECTOR STATE DEBUG ===')
        console.log('Local isInspecting:', currentInspectorStateRef.current)
        console.log('Parent isInspectorEnabled:', currentParentInspectorStateRef.current)
        console.log('isInspectorEnabled !== undefined:', currentParentInspectorStateRef.current !== undefined)
        // Send current inspector state to iframe - use parent state if available
        const stateToSend = currentParentInspectorStateRef.current !== undefined ? currentParentInspectorStateRef.current : currentInspectorStateRef.current
        console.log('Final state to send:', stateToSend)
        console.log('=== END DEBUG ===')
        if (iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage({
            type: 'SET_INSPECTOR_MODE',
            isInspecting: stateToSend
          }, '*');
        }
      }
    }

    // Helper function to load HTML file into iframe
    const loadHTMLIntoIframe = (htmlFile) => {
      const cssFiles = files.filter(f => f.type === 'css')
      const jsFiles = files.filter(f => f.type === 'js')
      const imageFiles = files.filter(f => ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(f.type))

      console.log('PreviewPane: Processing files', {
        html: htmlFile.name,
        css: cssFiles.length,
        js: jsFiles.length,
        images: imageFiles.length
      })

      let htmlContent = htmlFile.content

      // Replace image src attributes with blob URLs
      imageFiles.forEach(imageFile => {
        const imageName = imageFile.name
        const imagePath = imageFile.path
        const dataUrl = imageFile.content // This is already a data URL from FileUploader

        // Replace various possible image references
        const patterns = [
          new RegExp(`src=["']([^"']*/)?(${imageName})["']`, 'gi'),
          new RegExp(`src=["']([^"']*/)?(${imagePath})["']`, 'gi'),
          new RegExp(`src=["'](${imageName})["']`, 'gi'),
          new RegExp(`src=["'](${imagePath})["']`, 'gi')
        ]

        patterns.forEach(pattern => {
          htmlContent = htmlContent.replace(pattern, `src="${dataUrl}"`)
        })
      })

      // Remove existing CSS and JS links/scripts
      htmlContent = htmlContent.replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, '')
      htmlContent = htmlContent.replace(/<script[^>]*src=["'][^"']*["'][^>]*><\/script>/gi, '')

      // Inject CSS files as inline styles
      if (cssFiles.length > 0) {
        const cssContent = cssFiles.map(file => `/* ${file.name} */\n${file.content}`).join('\n\n')
        const cssTag = `<style>\n${cssContent}\n</style>`
        
        if (htmlContent.includes('</head>')) {
          htmlContent = htmlContent.replace('</head>', `${cssTag}\n</head>`)
        } else {
          htmlContent = `<head>${cssTag}</head>\n${htmlContent}`
        }
      }

      // Inject JS files as inline scripts
      if (jsFiles.length > 0) {
        const jsContent = jsFiles.map(file => `/* ${file.name} */\n${file.content}`).join('\n\n')
        const jsTag = `<script>\n${jsContent}\n</script>`
        
        if (htmlContent.includes('</body>')) {
          htmlContent = htmlContent.replace('</body>', `${jsTag}\n</body>`)
        } else {
          htmlContent = `${htmlContent}\n${jsTag}`
        }
      }

      // Add viewport meta tag for desktop rendering
      if (!htmlContent.includes('viewport')) {
        const viewportTag = '<meta name="viewport" content="width=1200, initial-scale=1.0">'
        if (htmlContent.includes('</head>')) {
          htmlContent = htmlContent.replace('</head>', `${viewportTag}\n</head>`)
        } else if (htmlContent.includes('<head>')) {
          htmlContent = htmlContent.replace('<head>', `<head>\n${viewportTag}`)
        } else {
          htmlContent = `<head>${viewportTag}</head>\n${htmlContent}`
        }
      }

      // Add inspector script (we'll define it inline here since it's in a different scope)
      const inlineInspectorScript = `
        <script>
          (function() {
            let selectedElement = null;
            let highlightDiv = null;
            let animationFrameId = null;
            let lastHighlightUpdateTime = 0;
            const THROTTLE_INTERVAL = 50; // ms
            let hoverTimeout = null;
            
            // Store original functions to prevent auto-scrolling
            const originalScrollIntoView = Element.prototype.scrollIntoView;
            const originalFocus = HTMLElement.prototype.focus;

            // Override scrollIntoView to prevent scrolling
            Element.prototype.scrollIntoView = function() {};

            // Override focus to prevent scrolling
            HTMLElement.prototype.focus = function() {
              const scrollX = window.scrollX || window.pageXOffset;
              const scrollY = window.scrollY || window.pageYOffset;
              originalFocus.call(this);
              window.scrollTo(scrollX, scrollY);
            };

            // Inspector mode state - start with false, will be set by parent
            let inspectorEnabled = false;
            
            // Flag to completely disable inspector functionality
            let inspectorScriptActive = false;

            function createHighlight() {
              highlightDiv = document.createElement('div');
              highlightDiv.style.position = 'absolute';
              highlightDiv.style.border = '2px solid #4a9eff';
              highlightDiv.style.pointerEvents = 'none';
              highlightDiv.style.zIndex = '999999';
              highlightDiv.style.boxSizing = 'border-box';
              highlightDiv.style.transition = 'all 0.05s ease-out';
              highlightDiv.style.visibility = 'hidden';
              highlightDiv.style.opacity = '0';
              document.body.appendChild(highlightDiv);
            }
            
            function highlightElement(elementToHighlight) {
              // Don't highlight anything when inspector is disabled
              if (!inspectorEnabled || !inspectorScriptActive) {
                if (highlightDiv) {
                  highlightDiv.style.visibility = 'hidden';
                  highlightDiv.style.opacity = '0';
                }
                return;
              }
              
              if (!elementToHighlight || elementToHighlight === document.body || elementToHighlight === document.documentElement) {
                if (highlightDiv && !window.currentSelectedElement) {
                  highlightDiv.style.visibility = 'hidden';
                  highlightDiv.style.opacity = '0';
                }
                return;
              }
              
              if (!highlightDiv) createHighlight();
              
              try {
                highlightDiv.style.visibility = 'hidden';
                highlightDiv.style.opacity = '0';
                
                const savedScrollX = window.scrollX || window.pageXOffset;
                const savedScrollY = window.scrollY || window.pageYOffset;

                const rect = elementToHighlight.getBoundingClientRect();
                window.scrollTo(savedScrollX, savedScrollY);

                highlightDiv.style.visibility = 'visible';
                highlightDiv.style.opacity = '1';
                
                if (rect.width === 0 && rect.height === 0) {
                  highlightDiv.style.left = (rect.left + savedScrollX) + 'px';
                  highlightDiv.style.top = (rect.top + savedScrollY) + 'px';
                  highlightDiv.style.width = '2px';
                  highlightDiv.style.height = '2px';
                } else if (rect.width < 2 || rect.height < 2) {
                  highlightDiv.style.left = (rect.left + savedScrollX) + 'px';
                  highlightDiv.style.top = (rect.top + savedScrollY) + 'px';
                  highlightDiv.style.width = Math.max(rect.width, 2) + 'px';
                  highlightDiv.style.height = Math.max(rect.height, 2) + 'px';
                } else {
                  highlightDiv.style.left = (rect.left + savedScrollX) + 'px';
                  highlightDiv.style.top = (rect.top + savedScrollY) + 'px';
                  highlightDiv.style.width = rect.width + 'px';
                  highlightDiv.style.height = rect.height + 'px';
                }
                
                if (!window.lastHighlightedElement || window.lastHighlightedElement !== elementToHighlight) {
                  console.log('Highlighting element:', {
                    tagName: elementToHighlight.tagName,
                    id: elementToHighlight.id,
                    className: elementToHighlight.className,
                    textContent: elementToHighlight.textContent?.substring(0, 30),
                    rect: rect,
                    highlightPos: {
                      left: highlightDiv.style.left,
                      top: highlightDiv.style.top,
                      width: highlightDiv.style.width,
                      height: highlightDiv.style.height
                    }
                  });
                  window.lastHighlightedElement = elementToHighlight;
                }
              } catch (error) {
                console.error('Error highlighting element:', error, elementToHighlight);
                if (highlightDiv) {
                  highlightDiv.style.visibility = 'hidden';
                  highlightDiv.style.opacity = '0';
                }
              }
            }

            document.addEventListener('click', function(e) {
              // If inspector is disabled, handle navigation properly
              if (!inspectorEnabled || !inspectorScriptActive) {
                // Always prevent default first
                e.preventDefault();
                e.stopPropagation();
                
                // Handle all clickable elements that might cause navigation
                let clickedElement = e.target;
                let href = null;
                
                // Check if clicked element or its parents have navigation
                while (clickedElement && clickedElement !== document.body) {
                  // Check for direct link
                  if (clickedElement.tagName === 'A' && clickedElement.href) {
                    href = clickedElement.getAttribute('href');
                    break;
                  }
                  
                  // Check for images inside links (like logo images)
                  if (clickedElement.tagName === 'IMG' && clickedElement.parentElement && clickedElement.parentElement.tagName === 'A') {
                    href = clickedElement.parentElement.getAttribute('href');
                    break;
                  }
                  
                  clickedElement = clickedElement.parentElement;
                }
                
                // If we found a navigation target, handle it
                if (href) {
                  if (href && !href.startsWith('http') && !href.startsWith('//') && href !== '#' && href !== '') {
                    // Internal navigation - notify parent to load the new page
                    console.log('Navigation detected:', href);
                    window.parent.postMessage({
                      type: 'NAVIGATE_TO_PAGE',
                      href: href
                    }, '*');
                  } else {
                    console.log('Blocked navigation:', href);
                  }
                }
                
                return false;
              }

              // Only run inspector functionality when both flags are true
              if (!inspectorScriptActive) return;
              
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              
              if (e.target === highlightDiv) return;
              
              if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
                e.target.blur();
              }

              const savedScrollX = window.scrollX || window.pageXOffset;
              const savedScrollY = window.scrollY || window.pageYOffset;

              if (highlightDiv) {
                highlightDiv.style.visibility = 'hidden';
                highlightDiv.style.opacity = '0';
              }

              let clickedElement = document.elementFromPoint(e.clientX, e.clientY);

              if (highlightDiv) {
                highlightDiv.style.visibility = 'visible';
                highlightDiv.style.opacity = '1';
              }

              window.scrollTo(savedScrollX, savedScrollY);

              if (!clickedElement || clickedElement === document.body || clickedElement === document.documentElement) {
                clickedElement = e.target;
              }

              if (clickedElement.nodeType === Node.TEXT_NODE || (clickedElement.getBoundingClientRect().width < 5 && clickedElement.getBoundingClientRect().height < 5)) {
                let parent = clickedElement.parentElement;
                while (parent && (parent.tagName === 'HTML' || parent.tagName === 'BODY' || parent.getBoundingClientRect().width < 5 || parent.getBoundingClientRect().height < 5)) {
                  parent = parent.parentElement;
                }
                if (parent) clickedElement = parent;
              }

              if (!clickedElement.dataset.vibecanvasId) {
                clickedElement.dataset.vibecanvasId = 'selected-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
              }

              selectedElement = clickedElement;
              window.currentSelectedElement = selectedElement;
              window.currentSelectedElementId = selectedElement.dataset.vibecanvasId;

              highlightElement(selectedElement);
              
              // Only send selection to parent if inspector is enabled
              if (inspectorEnabled) {
                // Send selection to parent (simplified for navigation fix)
                window.parent.postMessage({
                  type: 'ELEMENT_SELECTED',
                  element: {
                    tagName: selectedElement.tagName.toLowerCase(),
                    id: selectedElement.id || '',
                    className: selectedElement.className || '',
                    textContent: selectedElement.textContent?.trim() || '',
                    uniqueId: selectedElement.dataset.vibecanvasId
                  }
                }, '*');
              }
            }, true);
            
            document.addEventListener('mousemove', function(e) {
              // Completely skip all hover behavior when inspector is disabled
              if (!inspectorEnabled || !inspectorScriptActive) return;
              if (!highlightDiv) return;
              
              if (hoverTimeout) {
                clearTimeout(hoverTimeout);
              }
              
              if (window.currentSelectedElement) {
                highlightElement(window.currentSelectedElement);
                return;
              }
              
              if (!selectedElement) {
                hoverTimeout = setTimeout(() => {
                  const wasVisible = highlightDiv.style.display !== 'none';
                  if (wasVisible) {
                    highlightDiv.style.display = 'none';
                  }
                  
                  const element = document.elementFromPoint(e.clientX, e.clientY);
                  
                  if (wasVisible) {
                    highlightDiv.style.display = 'block';
                  }
                  
                  if (element && element !== document.body && element !== document.documentElement && 
                      element !== selectedElement && element !== highlightDiv) {
                    highlightElement(element);
                  }
                }, 50);
              }
            });

            window.addEventListener('message', function(e) {
              console.log('Iframe received message:', e.data);
              if (e.data.type === 'SET_INSPECTOR_MODE') {
                console.log('Setting inspector mode:', e.data.isInspecting);
                inspectorEnabled = e.data.isInspecting;
                inspectorScriptActive = e.data.isInspecting;
                
                if (!inspectorEnabled) {
                  console.log('Inspector disabled - completely shutting down inspector script');
                  // When inspector is disabled, completely clean up
                  if (highlightDiv) {
                    highlightDiv.style.display = 'none';
                    highlightDiv.style.visibility = 'hidden';
                    highlightDiv.style.opacity = '0';
                  }
                  selectedElement = null;
                  window.currentSelectedElement = null;
                  window.currentSelectedElementId = null;
                  window.lastHighlightedElement = null;
                  
                  // Notify parent that selection is cleared
                  window.parent.postMessage({
                    type: 'ELEMENT_SELECTED',
                    element: null
                  }, '*');
                  
                  console.log('Inspector disabled - all functionality stopped');
                } else {
                  console.log('Inspector enabled - activating inspector script');
                }
              }
            });

            // Request initial inspector state from parent
            window.parent.postMessage({ type: 'REQUEST_INSPECTOR_STATE' }, '*');
          })();
        </script>
      `;
      htmlContent = htmlContent.replace('</body>', inlineInspectorScript + '\\n</body>')

      const blob = new Blob([htmlContent], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      
      const iframe = iframeRef.current
      if (iframe) {
        // Clean up previous blob URL
        if (iframe.dataset.blobUrl) {
          URL.revokeObjectURL(iframe.dataset.blobUrl)
        }
        
        iframe.dataset.blobUrl = url
        iframe.src = url
        
        // Re-send inspector state after iframe loads
        iframe.onload = () => {
          setTimeout(() => {
            if (iframe.contentWindow) {
              const stateToSend = currentParentInspectorStateRef.current !== undefined ? currentParentInspectorStateRef.current : currentInspectorStateRef.current
              console.log('Re-sending inspector state after navigation:', stateToSend, '(local:', currentInspectorStateRef.current, 'parent:', currentParentInspectorStateRef.current, ')')
              iframe.contentWindow.postMessage({
                type: 'SET_INSPECTOR_MODE',
                isInspecting: stateToSend
              }, '*');
            }
          }, 100); // Small delay to ensure iframe is ready
        }
      }
    }

    window.addEventListener('message', handleMessage)

    // Re-select element after iframe loads if one is selected
    let handleLoad = null
    if (iframe) {
      handleLoad = () => {
        // Use multiple attempts to restore scroll and prevent auto-scroll
        const restoreScroll = () => {
          if (!iframe.contentWindow) return
          
          try {
            // Restore scroll position immediately
            if (scrollPositionRef.current.y > 0 || scrollPositionRef.current.x > 0) {
              iframe.contentWindow.scrollTo(
                scrollPositionRef.current.x,
                scrollPositionRef.current.y
              )
            }
          } catch (e) {
            // Ignore scroll errors
          }
        }
        
        // Restore scroll immediately
        restoreScroll()
        
        // Also restore after a short delay to catch any late scrolls
        setTimeout(restoreScroll, 50)
        setTimeout(restoreScroll, 100)
        setTimeout(restoreScroll, 200)
        
        // Re-select element if one was selected (but don't let it scroll)
        setTimeout(() => {
          if (selectedElement && iframe.contentWindow) {
            iframe.contentWindow.postMessage({
              type: 'SELECT_ELEMENT',
              element: selectedElement
            }, '*')
            // Restore scroll again after selection
            restoreScroll()
          }
        }, 150)
      }
      iframe.addEventListener('load', handleLoad)
      
      // If already loaded, trigger immediately
      if (iframe.contentDocument?.readyState === 'complete') {
        handleLoad()
      }
    }

    return () => {
      window.removeEventListener('message', handleMessage)
      if (iframe && handleLoad) {
        iframe.removeEventListener('load', handleLoad)
      }
      URL.revokeObjectURL(url)
    }
  }, [files, selectedFile])

  const sendStyleUpdate = (property, value) => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        type: 'UPDATE_STYLE',
        property: property,
        value: value
      }, '*')
    }
  }

  useEffect(() => {
    // Wait for iframe to load before sending messages
    const currentIframe = iframeRef.current
    if (!currentIframe) return

    const handleIframeLoad = () => {
      if (selectedElement && currentIframe.contentWindow) {
        // Send selection to iframe
        setTimeout(() => {
          currentIframe.contentWindow.postMessage({
            type: 'SELECT_ELEMENT',
            element: selectedElement
          }, '*')
        }, 100)
      }
    }

    currentIframe.addEventListener('load', handleIframeLoad)
    
    // Also try immediately if already loaded
    if (currentIframe.contentDocument?.readyState === 'complete') {
      handleIframeLoad()
    }

    return () => {
      currentIframe.removeEventListener('load', handleIframeLoad)
    }
  }, [selectedElement])

  return (
    <div className="preview-pane">
      <div className="preview-header">
        <h3>Preview</h3>
        <label className="inspector-toggle">
          <input
            type="checkbox"
            checked={isInspecting}
            onChange={(e) => {
              const newValue = e.target.checked;
              console.log('=== CHECKBOX TOGGLE DEBUG ===');
              console.log('Checkbox toggled to:', newValue);
              console.log('onInspectorToggle function exists:', !!onInspectorToggle);
              setIsInspecting(newValue);
              // Always notify parent about inspector state change
              if (onInspectorToggle) {
                console.log('Calling onInspectorToggle with:', newValue);
                onInspectorToggle(newValue);
              } else {
                console.error('onInspectorToggle function not provided!');
              }
              console.log('=== END CHECKBOX DEBUG ===');
            }}
          />
          <span>Element Inspector</span>
        </label>
      </div>
      <div className="preview-content">
        <iframe
          ref={iframeRef}
          title="Preview"
          className="preview-iframe"
          sandbox="allow-scripts allow-same-origin allow-forms"
        />
      </div>
    </div>
  )
})

PreviewPane.displayName = 'PreviewPane'

export default PreviewPane

