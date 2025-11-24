import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react'
import GridOverlay from './GridOverlay'
import './PreviewPane.css'

const PreviewPane = forwardRef(({ files, selectedFile, selectedElement, onElementSelect, onInspectorToggle, isInspectorEnabled, onSettingsToggle, gridOverlay, gridColor, isTextEditing, saveStatus, lastSaved, user, onAuthClick, onSaveClick, onFileSelect }, ref) => {
  const iframeRef = useRef(null)
  const [isInspecting, setIsInspecting] = useState(() => {
    console.log('PreviewPane: Initializing isInspecting state with isInspectorEnabled:', isInspectorEnabled)
    return isInspectorEnabled ?? true
  })
  const [isLoading, setIsLoading] = useState(false)
  const [hasError, setHasError] = useState(false)
  const hasInitialLoadRef = useRef(false)
  
  // Show loading state only on initial project load
  useEffect(() => {
    if (!files || files.length === 0) {
      // Reset flag when files are cleared (new project about to load)
      hasInitialLoadRef.current = false;
      setIsLoading(false); // Clear loading when files are cleared
      return;
    }
    
    if (files && files.length > 0 && !hasInitialLoadRef.current) {
      console.log('Initial project load - showing loading state');
      hasInitialLoadRef.current = true; // Mark as loaded
      setIsLoading(true);
      setHasError(false);
      
      // Clear loading state after 1 second (fallback in case iframe doesn't load)
      const timeout = setTimeout(() => {
        console.log('Initial load timeout (fallback) - clearing loading state');
        setIsLoading(false);
      }, 1000);
      
      return () => clearTimeout(timeout);
    }
  }, [files])

  // Send text editing state to iframe
  useEffect(() => {
    if (iframeRef.current?.contentWindow) {
      console.log('Sending text editing state to iframe:', isTextEditing);
      iframeRef.current.contentWindow.postMessage({
        type: 'SET_TEXT_EDITING_MODE',
        isTextEditing: isTextEditing
      }, '*');
    }
  }, [isTextEditing])

  const selectedElementRef = useRef(null)
  const scrollPositionRef = useRef({ x: 0, y: 0 })
  const currentInspectorStateRef = useRef(isInspecting)
  const currentParentInspectorStateRef = useRef(isInspectorEnabled)
  const lastReloadTimeRef = useRef(0)
  const reloadDebounceRef = useRef(null)
  const lastNavigationTimeRef = useRef(0) // Throttle navigation
  const navigationThrottleRef = useRef(null) // Navigation throttle timer

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
      // Use requestAnimationFrame to ensure iframe is ready
      const sendMessage = () => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        type: 'SET_INSPECTOR_MODE',
        isInspecting: isInspecting
      }, '*');
        }
      };
      
      // Try immediately
      sendMessage();
      
      // Also try after a short delay to ensure iframe processed previous messages
      const timeout = setTimeout(sendMessage, 10);
      
      return () => clearTimeout(timeout);
    }
  }, [isInspecting]);

  useImperativeHandle(ref, () => ({
    updateElementStyle: (property, value, childElement = null) => {
      console.log('PreviewPane.updateElementStyle called:', { property, value, childElement });
      
      if (iframeRef.current?.contentWindow) {
        console.log('Sending UPDATE_STYLE message to iframe');
        
        // For childTextContent, format the value correctly
        let messageValue = value;
        if (property === 'childTextContent' && childElement) {
          // Format as expected by iframe: { element: childInfo, newText }
          messageValue = {
            element: {
              tagName: childElement.tagName || '',
              className: childElement.className || '',
              id: childElement.id || ''
            },
            newText: value
          };
        }
        
        iframeRef.current.contentWindow.postMessage({
          type: 'UPDATE_STYLE',
          property: property,
          value: messageValue,
          childElement: childElement
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
    
    if (!htmlFile) {
      console.warn('PreviewPane: No HTML file found')
      return
    }
    
    if (!htmlFile.content) {
      console.error('PreviewPane: HTML file has no content:', htmlFile.name)
      return
    }

    // Filter CSS files - check both type and file extension to be safe
    const cssFiles = files.filter(f => {
      const isCssType = f.type === 'css'
      const isCssExtension = f.name.toLowerCase().endsWith('.css')
      const matches = isCssType || isCssExtension
      if (matches) {
        console.log(`Found CSS file: ${f.name} (type: ${f.type}, extension check: ${isCssExtension})`)
      }
      return matches
    })
    
    // Filter JS files - check both type and file extension to be safe
    const jsFiles = files.filter(f => {
      const isJsType = f.type === 'js'
      const isJsExtension = f.name.toLowerCase().endsWith('.js')
      return isJsType || isJsExtension
    })

    console.log('PreviewPane: Processing files', {
      htmlFile: htmlFile.name,
      totalFiles: files.length,
      allFileTypes: files.map(f => ({ name: f.name, type: f.type })),
      cssFiles: cssFiles.map(f => ({ name: f.name, type: f.type, contentLength: f.content?.length, hasContent: !!f.content })),
      jsFiles: jsFiles.map(f => f.name)
    })

      // Build HTML with embedded CSS and JS
      let htmlContent = htmlFile.content
      
      if (!htmlContent || typeof htmlContent !== 'string') {
        console.error('PreviewPane: HTML content is invalid:', {
          hasContent: !!htmlContent,
          contentType: typeof htmlContent,
          fileName: htmlFile.name
        })
        return
      }
      
      // Add performance and stability optimizations to HTML
      const performanceOptimizations = `
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          /* Critical CSS to prevent FOUC */
          * { box-sizing: border-box; }
          body { 
            margin: 0; 
            font-family: system-ui, -apple-system, sans-serif;
            line-height: 1.5;
            visibility: visible !important;
            opacity: 1 !important;
          }
          /* Prevent layout shifts */
          img { max-width: 100%; height: auto; }
          /* Smooth transitions */
          * { transition: none !important; }
        </style>
      `
      
      // Insert performance optimizations in head
      htmlContent = htmlContent.replace('<head>', '<head>' + performanceOptimizations)
    
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
      console.log(`✅ Found ${cssFiles.length} CSS file(s) to inject:`, cssFiles.map(f => ({ 
        name: f.name, 
        type: f.type, 
        hasContent: !!f.content,
        contentType: typeof f.content,
        contentLength: f.content?.length 
      })))
      
      const cssTagsToInject = cssFiles
        .filter(cssFile => {
          const hasContent = cssFile.content && typeof cssFile.content === 'string' && cssFile.content.trim().length > 0
          if (!hasContent) {
            console.error(`❌ CSS file ${cssFile.name} has no valid content:`, {
              hasContent: !!cssFile.content,
              contentType: typeof cssFile.content,
              contentLength: cssFile.content?.length
            })
          }
          return hasContent
        })
        .map(cssFile => {
          const contentLength = cssFile.content ? cssFile.content.length : 0
          console.log(`✅ Injecting CSS from ${cssFile.name} (${contentLength} chars)`)
          const safeId = cssFile.name.replace(/[^a-zA-Z0-9]/g, '-')
          return `<style id="injected-${safeId}">${cssFile.content}</style>`
        })
        .join('\n')
      
      if (cssTagsToInject) {
        const injectedCount = cssFiles.filter(f => f.content && typeof f.content === 'string' && f.content.trim()).length
        console.log(`✅ Injecting ${injectedCount} CSS file(s) into HTML`)
      
      // Inject CSS at the start of <head> for proper cascade order
      if (htmlContent.includes('<head>')) {
        // Insert right after <head> tag (only first occurrence)
        htmlContent = htmlContent.replace(/<head>/i, `<head>\n${cssTagsToInject}\n`)
          console.log('✅ CSS injected after <head> tag')
      } else if (htmlContent.includes('</head>')) {
        // Insert before </head> if <head> tag exists but we can't find opening
        htmlContent = htmlContent.replace(/<\/head>/i, `${cssTagsToInject}\n</head>`)
          console.log('✅ CSS injected before </head> tag')
      } else if (htmlContent.includes('<body>')) {
        // Fallback: inject before body
        htmlContent = htmlContent.replace(/<body>/i, `${cssTagsToInject}\n<body>`)
          console.log('✅ CSS injected before <body> tag')
      } else {
        // Last resort: prepend to document
        htmlContent = `${cssTagsToInject}\n${htmlContent}`
          console.log('✅ CSS prepended to document')
      }
    } else {
        console.error('❌ No valid CSS content to inject - all CSS files were empty or invalid')
      }
    } else {
      console.error('❌ No CSS files found to inject.')
      console.error('Available files:', files.map(f => ({ name: f.name, type: f.type })))
      console.error('💡 TIP: When opening individual files, make sure to select BOTH your HTML file AND CSS file(s) together.')
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
        // Use dataUrl if available, otherwise fall back to content (for backward compatibility)
        const imageDataUrl = imageFile.dataUrl || imageFile.content;
        
        if (!imageDataUrl) {
          console.warn(`No data URL found for image: ${imageName}`);
          return;
        }
        
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
              textContent: element.textContent?.trim() || '',
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
          
          // Flag to prevent navigation during text editing
          let isTextEditing = ${isTextEditing || false};
          
          // Professional selection state management
          let selectionState = {
            isSelecting: false,           // Flag: new selection in progress
            selectionTimestamp: 0,         // When current selection was made
            lastSelectionId: null,        // ID of last selection
            selectionLockTimeout: null     // Timeout to clear selection lock
          };
          
          // Clear selection lock after a brief period (allows drift detection to resume)
          function clearSelectionLock() {
            if (selectionState.selectionLockTimeout) {
              clearTimeout(selectionState.selectionLockTimeout);
            }
            selectionState.selectionLockTimeout = setTimeout(() => {
              selectionState.isSelecting = false;
            }, 200); // 200ms grace period for new selections
          }
          
          // Navigation debounce to prevent rapid clicks
          let navigationDebounceTimer = null;
          let lastNavigationTime = 0;
          
          // Professional: Navigation handler - ALWAYS attached (works even when inspector is off)
          // This handles link navigation regardless of inspector state
          if (window.vibecanvasNavigationHandler) {
            document.removeEventListener('click', window.vibecanvasNavigationHandler, true);
          }
          
          window.vibecanvasNavigationHandler = function(e) {
            // CRITICAL: Only handle navigation when inspector is OFF
            // When inspector is ON, let the inspector handler deal with everything
            if (inspectorEnabled) {
              return; // Don't interfere
            }
            
              // Check if this is a navigation link
              let clickedElement = e.target;
              let isNavigationLink = false;
              let href = null;
              
              // Check if clicked element or its parent is a link
              while (clickedElement && clickedElement !== document.body) {
                if (clickedElement.tagName === 'A' && clickedElement.href) {
                  isNavigationLink = true;
                  href = clickedElement.getAttribute('href') || clickedElement.href;
                  break;
                }
                
                // Check for images inside links
                if (clickedElement.tagName === 'IMG' && clickedElement.parentElement && clickedElement.parentElement.tagName === 'A') {
                  isNavigationLink = true;
                  href = clickedElement.parentElement.getAttribute('href') || clickedElement.parentElement.href;
                  break;
                }
                
                clickedElement = clickedElement.parentElement;
              }
              
            // If it's a navigation link, handle it
              if (isNavigationLink) {
                // Block navigation during text editing
                if (isTextEditing) {
                  e.preventDefault();
                  e.stopPropagation();
                  return false;
                }
                
              // Prevent default browser navigation
                e.preventDefault();
                e.stopPropagation();
                
                // Extract just the filename from the href
              let normalizedHref = href;
                if (href.includes('://')) {
                  try {
                    const url = new URL(href);
                  normalizedHref = url.pathname.split('/').pop() || url.pathname;
                  } catch (e) {
                  normalizedHref = href.split('/').pop().split('?')[0];
                  }
                } else {
                normalizedHref = href.split('?')[0].split('#')[0];
                if (normalizedHref.startsWith('/')) {
                  normalizedHref = normalizedHref.substring(1);
                  }
                }
                
              if (normalizedHref && normalizedHref !== '' && normalizedHref !== '#' && !normalizedHref.startsWith('http') && !normalizedHref.startsWith('//')) {
                // Debounce navigation
                  const now = Date.now();
                if (now - lastNavigationTime < 100) {
                    return false;
                  }
                  
                  // Clear any pending navigation
                  if (navigationDebounceTimer) {
                    clearTimeout(navigationDebounceTimer);
                  }
                  
                    lastNavigationTime = Date.now();
                    window.parent.postMessage({
                      type: 'NAVIGATE_TO_PAGE',
                  href: normalizedHref
                    }, '*');
                }
                return false;
              }
              
            // Not a navigation link - let it pass through
            return;
          };
          
          // Always attach navigation handler (works regardless of inspector state)
          document.addEventListener('click', window.vibecanvasNavigationHandler, true);
          
          // Professional event listener management
          // Remove old click listener if it exists (prevent duplicates)
          if (window.vibecanvasClickHandler) {
            document.removeEventListener('click', window.vibecanvasClickHandler, true);
            window.vibecanvasClickHandler = null;
          }
          
          // Function to attach/remove click handler based on inspector state
          function manageClickHandler(shouldAttach) {
            if (shouldAttach && !window.vibecanvasClickHandler) {
              // Named click handler function
              window.vibecanvasClickHandler = function(e) {
                // Only handle clicks when inspector is enabled
                if (!inspectorEnabled) {
                  // Inspector is off - let navigation handler deal with links, don't interfere
                  // Check if it's a navigation link - if so, let navigation handler deal with it
                  let clickedElement = e.target;
                  let isNavigationLink = false;
                  while (clickedElement && clickedElement !== document.body) {
                    if (clickedElement.tagName === 'A' && clickedElement.href) {
                      isNavigationLink = true;
                      break;
                    }
                    clickedElement = clickedElement.parentElement;
                  }
                  
                  if (isNavigationLink) {
                    // Let navigation handler deal with it
                    return;
                  }
                  
                  // Not a link, let it work normally
                  return; // Don't prevent default, don't stop propagation
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
            
            // Professional selection: Mark new selection in progress
            selectionState.isSelecting = true;
            selectionState.selectionTimestamp = Date.now();
            const newSelectionId = 'selected-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
            selectionState.lastSelectionId = newSelectionId;
            
            // Clear any pending lock timeout
            clearSelectionLock();
            
            selectedElement = targetElement;
            
            // Store a permanent reference to prevent it from changing
            window.currentSelectedElement = selectedElement;
            
            // Create a unique identifier for this specific element
            selectedElement.dataset.vibecanvasId = newSelectionId;
            window.currentSelectedElementId = newSelectionId;
            
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
          };
          
              // Attach the handler
          document.addEventListener('click', window.vibecanvasClickHandler, true);
            } else if (!shouldAttach && window.vibecanvasClickHandler) {
              // Remove the handler when inspector is off
              document.removeEventListener('click', window.vibecanvasClickHandler, true);
              window.vibecanvasClickHandler = null;
            }
          }
          
          // Initially attach handler if inspector is enabled
          manageClickHandler(inspectorEnabled);
          
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
              
              // Professional drift detection: Only restore if NOT in the middle of a new selection
              // and the selection is older than the grace period
              if (!selectionState.isSelecting && 
                  window.currentSelectedElement && 
                  selectedElement !== window.currentSelectedElement) {
                
                // Check if this is actual drift (old selection) vs new selection
                const timeSinceSelection = now - selectionState.selectionTimestamp;
                const isOldSelection = timeSinceSelection > 300; // 300ms grace period
                
                // Only restore if:
                // 1. We're not currently selecting
                // 2. The selection is old (not a new one)
                // 3. The IDs don't match (actual drift)
                if (isOldSelection && 
                    window.currentSelectedElementId && 
                    selectedElement.dataset.vibecanvasId !== window.currentSelectedElementId) {
                  console.warn('Selection drift detected! Restoring original selection.');
                  selectedElement = window.currentSelectedElement;
                }
              }
              
              // Check if our selected element still exists in DOM
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
            
            if (e.data.type === 'SET_TEXT_EDITING_MODE') {
              console.log('Setting text editing mode:', e.data.isTextEditing);
              isTextEditing = e.data.isTextEditing;
            } else if (e.data.type === 'UPDATE_STYLE') {
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
                  
                  // Handle both old format (string) and new format (object)
                  let childInfo, newText;
                  if (typeof e.data.value === 'string') {
                    // Old format - try to use childElement from message
                    if (e.data.childElement) {
                      childInfo = {
                        tagName: e.data.childElement.tagName || '',
                        className: e.data.childElement.className || '',
                        id: e.data.childElement.id || ''
                      };
                      newText = e.data.value;
                    } else {
                      console.warn('childTextContent value is string but no childElement provided');
                      return;
                    }
                  } else if (e.data.value && typeof e.data.value === 'object') {
                    // New format
                    childInfo = e.data.value.element;
                    newText = e.data.value.newText;
                  } else {
                    console.warn('Invalid childTextContent format:', e.data.value);
                    return;
                  }
                  
                  // Find the specific child element to update
                  let childElement = null;
                  
                  // Try to find by ID first (most specific)
                  if (childInfo.id) {
                    childElement = targetElement.querySelector('#' + childInfo.id);
                  }
                  
                  // If not found by ID, try by tag and class
                  if (!childElement && childInfo.tagName && childInfo.className) {
                    const candidates = Array.from(targetElement.querySelectorAll(childInfo.tagName));
                    childElement = candidates.find(el => {
                      return el.className === childInfo.className;
                    });
                  }
                  
                  // If still not found, try by tag only
                  if (!childElement && childInfo.tagName) {
                    const candidates = Array.from(targetElement.querySelectorAll(childInfo.tagName));
                    // Try to find by matching text content or position
                    childElement = candidates[0]; // Fallback to first match
                  }
                  
                  if (childElement) {
                    // Update the text content - replace all text nodes with the new text
                    // First, remove all existing text nodes
                    const textNodes = Array.from(childElement.childNodes).filter(
                      node => node.nodeType === Node.TEXT_NODE
                    );
                    textNodes.forEach(node => node.remove());
                    
                    // Add the new text as a text node
                    childElement.appendChild(document.createTextNode(newText));
                    
                    console.log('Updated child element text:', {
                      tag: childElement.tagName,
                      id: childElement.id,
                      className: childElement.className,
                      newText: newText
                    });
                    
                    // Re-establish selection to prevent freezing
                    selectedElement = targetElement;
                    window.currentSelectedElement = targetElement;
                    highlightElement(targetElement);
                  } else {
                    console.warn('Could not find child element to update:', childInfo);
                  }
                  
                } else if (e.data.property === 'placeholder') {
                  console.log('Updating placeholder to:', e.data.value);
                  if (targetElement.tagName === 'INPUT' || targetElement.tagName === 'TEXTAREA') {
                    targetElement.placeholder = e.data.value;
                  }
                  
                } else if (e.data.property === 'textContent') {
                  console.log('Updating text content to:', e.data.value);
                  console.log('Target element before update:', targetElement.textContent);
                  targetElement.textContent = e.data.value;
                  console.log('Target element after update:', targetElement.textContent);
                  
                  // CRITICAL: Re-establish selection after text change
                  // Mark as selecting to prevent drift detection from interfering
                  if (typeof selectionState !== 'undefined') {
                    selectionState.isSelecting = true;
                    selectionState.selectionTimestamp = Date.now();
                    if (typeof clearSelectionLock === 'function') {
                      clearSelectionLock();
                    }
                  }
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
                  // Mark as selecting to prevent drift detection from interfering
                  if (typeof selectionState !== 'undefined') {
                    selectionState.isSelecting = true;
                    selectionState.selectionTimestamp = Date.now();
                    if (typeof clearSelectionLock === 'function') {
                      clearSelectionLock();
                    }
                  }
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
              const wasEnabled = inspectorEnabled;
              inspectorEnabled = e.data.isInspecting;
              
              // Professional: Manage click handler based on inspector state
              if (typeof window.manageClickHandler === 'function') {
                window.manageClickHandler(inspectorEnabled);
              }
              
              // Clean up when disabling inspector
              if (!inspectorEnabled && wasEnabled) {
                console.log('Inspector disabled - cleaning up (inline script)');
                
                // Clear selection state machine (if it exists in this scope)
                if (typeof selectionState !== 'undefined') {
                  selectionState.isSelecting = false;
                  selectionState.selectionTimestamp = 0;
                  selectionState.lastSelectionId = null;
                  if (selectionState.selectionLockTimeout) {
                    clearTimeout(selectionState.selectionLockTimeout);
                    selectionState.selectionLockTimeout = null;
                  }
                }
                
                // Hide and clean up highlight
                if (highlightDiv) {
                highlightDiv.style.display = 'none';
                  highlightDiv.style.visibility = 'hidden';
                  highlightDiv.style.opacity = '0';
                }
                
                // Clear selection state
                selectedElement = null;
                window.currentSelectedElement = null;
                window.currentSelectedElementId = null;
                window.lastHighlightedElement = null;
                
                // Notify parent that selection is cleared
                window.parent.postMessage({
                  type: 'ELEMENT_SELECTED',
                  element: null
                }, '*');
              } else if (inspectorEnabled && !wasEnabled) {
                console.log('Inspector enabled - activating (inline script)');
                // Reset selection state when enabling
                if (typeof selectionState !== 'undefined') {
                  selectionState.isSelecting = false;
                  selectionState.selectionTimestamp = 0;
                }
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
    
    // Validate HTML content before creating blob
    if (!htmlContent || typeof htmlContent !== 'string' || htmlContent.trim().length === 0) {
      console.error('PreviewPane: HTML content is invalid or empty!', {
        hasContent: !!htmlContent,
        contentType: typeof htmlContent,
        contentLength: htmlContent?.length,
        htmlFile: htmlFile.name
      });
      setHasError(true);
      setIsLoading(false);
      return;
    }
    
    // Check for basic HTML structure
    const hasHtmlTag = htmlContent.includes('<html') || htmlContent.includes('<!DOCTYPE');
    const hasBodyTag = htmlContent.includes('<body');
    if (!hasHtmlTag && !hasBodyTag) {
      console.warn('PreviewPane: HTML content may be malformed - missing html or body tags');
    }
    
    console.log('Final HTML check:', {
      hasStyleTags,
      styleTagCount,
      htmlLength: htmlContent.length,
      hasHtmlTag,
      hasBodyTag,
      first500Chars: htmlContent.substring(0, 500),
      last200Chars: htmlContent.substring(Math.max(0, htmlContent.length - 200))
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
    
    // Store old URL BEFORE creating/setting new one (critical for cleanup)
    const oldBlobUrl = iframe?.dataset.blobUrl;
    
    if (iframe) {
      // Set new blob URL BEFORE revoking old one (prevents blank screen)
      iframe.dataset.blobUrl = url;
      
      // Clear loading state when iframe loads
      const handleLoad = () => {
        console.log('Preview iframe loaded successfully - clearing loading state');
        setIsLoading(false);
        
        // Revoke old URL AFTER new one has loaded (prevents blank screen)
        if (oldBlobUrl && oldBlobUrl !== url) {
          setTimeout(() => {
            try {
              URL.revokeObjectURL(oldBlobUrl);
              console.log('Revoked old blob URL in load handler');
            } catch (e) {
              console.warn('Error revoking old blob URL:', e);
            }
          }, 1000); // Wait a bit to ensure new URL is fully loaded
        }
        
        // Remove event listener
        if (iframe) {
          iframe.removeEventListener('load', handleLoad);
        }
      };
      
      // Add load listener before setting src
      iframe.addEventListener('load', handleLoad);
      
      // Set the new src (this triggers the load event)
      console.log('Setting iframe src to new blob URL');
      iframe.src = url;
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
        // Throttle navigation to prevent overwhelming the system
        const now = Date.now();
        if (now - lastNavigationTimeRef.current < 500) {
          return;
        }
        
        // Clear any pending navigation
        if (navigationThrottleRef.current) {
          clearTimeout(navigationThrottleRef.current);
        }
        
        // Throttle navigation
        navigationThrottleRef.current = setTimeout(() => {
          lastNavigationTimeRef.current = Date.now();
          
          // Find the target HTML file - try multiple matching strategies
          let targetFile = files.find(f => {
            const fileName = f.name.toLowerCase();
            const href = event.data.href.toLowerCase();
            
            // Exact match
            if (fileName === href) return true;
            
            // Match without extension
            if (fileName.replace('.html', '') === href.replace('.html', '')) return true;
            
            // Match if filename ends with href
            if (fileName.endsWith(href) || href.endsWith(fileName)) return true;
            
            // Match if href is in filename or vice versa
            if (fileName.includes(href) || href.includes(fileName)) return true;
            
            return false;
          });
        
          if (targetFile && targetFile.type === 'html') {
            // Reload the iframe with the new file
            loadHTMLIntoIframe(targetFile);
          } else {
            console.warn('Could not find HTML file for navigation:', event.data.href, 'Available files:', files?.map(f => f.name) || 'NO FILES');
            // Professional: Don't leave iframe in broken state - ensure loading state is cleared
            setIsLoading(false);
            setHasError(false);
          }
        }, 100); // 100ms throttle delay
        return; // Exit early, navigation will happen in throttle
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
      if (!htmlFile) {
        console.error('ERROR: htmlFile is null or undefined in loadHTMLIntoIframe');
        setIsLoading(false);
        setHasError(true);
        return;
      }
      
      // Professional: Set loading state and update parent file selection
      setIsLoading(true);
      setHasError(false);
      
      // Update parent component's selected file state
      if (onFileSelect && htmlFile) {
        onFileSelect(htmlFile);
      }
      
      // Filter CSS files - check both type and file extension to be safe
      const cssFiles = files.filter(f => {
        const isCssType = f.type === 'css'
        const isCssExtension = f.name.toLowerCase().endsWith('.css')
        return isCssType || isCssExtension
      })
      
      // Filter JS files - check both type and file extension to be safe
      const jsFiles = files.filter(f => {
        const isJsType = f.type === 'js'
        const isJsExtension = f.name.toLowerCase().endsWith('.js')
        return isJsType || isJsExtension
      })
      const imageFiles = files.filter(f => ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(f.type))

      console.log('PreviewPane: Processing files', {
        html: htmlFile.name,
        css: cssFiles.length,
        js: jsFiles.length,
        images: imageFiles.length
      })

      let htmlContent = htmlFile.content

      // Replace image src attributes with data URLs
      imageFiles.forEach(imageFile => {
        const imageName = imageFile.name
        const imagePath = imageFile.path
        // Use dataUrl if available, otherwise fall back to content (for backward compatibility)
        const dataUrl = imageFile.dataUrl || imageFile.content

        if (!dataUrl) {
          console.warn(`No data URL found for image: ${imageName}`);
          return;
        }

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
        console.log(`Found ${cssFiles.length} CSS file(s) for navigation:`, cssFiles.map(f => f.name))
        
        const validCssFiles = cssFiles.filter(file => {
          const hasContent = file.content && typeof file.content === 'string' && file.content.trim().length > 0
          if (!hasContent) {
            console.warn(`CSS file ${file.name} has no content for navigation injection`)
          }
          return hasContent
        })
        
        if (validCssFiles.length > 0) {
          const cssContent = validCssFiles.map(file => `/* ${file.name} */\n${file.content}`).join('\n\n')
        const cssTag = `<style>\n${cssContent}\n</style>`
        
        if (htmlContent.includes('</head>')) {
          htmlContent = htmlContent.replace('</head>', `${cssTag}\n</head>`)
          } else if (htmlContent.includes('<head>')) {
            htmlContent = htmlContent.replace('<head>', `<head>\n${cssTag}`)
        } else {
          htmlContent = `<head>${cssTag}</head>\n${htmlContent}`
        }
          
          console.log(`Injected ${validCssFiles.length} CSS file(s) for navigation`)
        } else {
          console.warn('No valid CSS content to inject for navigation')
        }
      } else {
        console.warn('No CSS files found for navigation. Available files:', files.map(f => ({ name: f.name, type: f.type })))
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
            
            // Flag to prevent navigation during text editing
            let isTextEditing = ${isTextEditing || false};
            
            // Professional selection state management (for inspector script)
            let selectionState = {
              isSelecting: false,           // Flag: new selection in progress
              selectionTimestamp: 0,       // When current selection was made
              lastSelectionId: null,       // ID of last selection
              selectionLockTimeout: null   // Timeout to clear selection lock
            };
            
            // Clear selection lock after a brief period
            function clearSelectionLock() {
              if (selectionState.selectionLockTimeout) {
                clearTimeout(selectionState.selectionLockTimeout);
              }
              selectionState.selectionLockTimeout = setTimeout(() => {
                selectionState.isSelecting = false;
              }, 200); // 200ms grace period for new selections
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
              
              // Check for screen reader only classes
              const hasHiddenClass = el.classList.contains('sr-only') || 
                                   el.classList.contains('visually-hidden') || 
                                   el.classList.contains('screen-reader-only') ||
                                   el.classList.contains('hidden');
              
              // Check if element is off-screen or has zero size
              const isOffScreen = rect.width === 0 && rect.height === 0;
              const isFarOffScreen = rect.right < 0 || rect.bottom < 0 || rect.left > window.innerWidth || rect.top > window.innerHeight;
              
              return isDisplayNone || isVisibilityHidden || isOpacityZero || hasHiddenClass || isOffScreen || isFarOffScreen;
            }

            // Function to get element info with child text elements
            function getElementInfo(element) {
              if (!element || element.nodeType !== Node.ELEMENT_NODE) return null;
              
              const computedStyle = window.getComputedStyle(element);
              const rect = element.getBoundingClientRect();
              
              // Extract child text elements for multi-text editing
              const childTextElements = [];
              
              function findTextElements(el, path = '') {
                if (!el || !el.childNodes || !el.tagName) return;
                
                try {
                  // Check for direct text content in this element
                  let textToUse = '';
                  Array.from(el.childNodes).forEach(node => {
                    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0) {
                      textToUse += node.textContent.trim() + ' ';
                    }
                  });
                  textToUse = textToUse.trim();
                  
                  // Check if element is visually hidden
                  const isHidden = isElementHidden(el);
                  
                  if (textToUse.length > 0 && !isHidden) {
                    childTextElements.push({
                      text: textToUse,
                      tagName: el.tagName,
                      className: el.className || '',
                      id: el.id || '',
                      path: path || el.tagName + (el.id ? '#' + el.id : '') + (el.className ? '.' + el.className.split(' ')[0] : ''),
                      uniqueId: el.dataset.vibecanvasId || 'temp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5)
                    });
                  }
                  
                  // Recursively check child elements
                  Array.from(el.children).forEach((child, index) => {
                    const childPath = (path ? path + ' > ' : '') + child.tagName + (child.id ? '#' + child.id : '') + (child.className ? '.' + child.className.split(' ')[0] : '');
                    findTextElements(child, childPath);
                  });
                } catch (error) {
                  console.error('Error processing element in findTextElements:', error, el);
                }
              }
              
              // Find all text elements within this element
              findTextElements(element);
              
              console.log('Found child text elements in iframe (visible only):', childTextElements);
              
              return {
                tagName: element.tagName.toLowerCase(),
                id: element.id || '',
                className: element.className || '',
                textContent: element.textContent?.trim() || '',
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
                },
                uniqueId: element.dataset.vibecanvasId
              };
            }

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

            // Navigation debounce for inspector script
            let inspectorNavigationDebounceTimer = null;
            let inspectorLastNavigationTime = 0;
            
            // Remove old inspector click listener if it exists (prevent duplicates)
            if (window.vibecanvasInspectorClickHandler) {
              document.removeEventListener('click', window.vibecanvasInspectorClickHandler, true);
              window.vibecanvasInspectorClickHandler = null;
            }
            
            // Named click handler function for inspector script
            // Professional: This handler ONLY runs when inspector is enabled
            // When inspector is disabled, the handler is removed entirely
            window.vibecanvasInspectorClickHandler = function(e) {
              // CRITICAL: Safety check at the very beginning - if inspector is disabled, immediately return and remove handler
              if (!inspectorEnabled || !inspectorScriptActive) {
                // Handler should be removed, but if it's still attached, remove it now and don't interfere
                console.warn('Inspector click handler called but inspector is disabled - removing handler now');
                // Remove the handler immediately if it's still attached
                const handler = window.vibecanvasInspectorClickHandler;
                if (handler) {
                  document.removeEventListener('click', handler, true);
                  window.vibecanvasInspectorClickHandler = null;
                  }
                return; // Don't prevent default, don't stop propagation - let everything work normally
              }

              // Inspector is enabled - handle element selection
              // Remove the redundant check - we already know inspector is enabled from above
              
              // Allow element selection even during text editing (but prevent navigation)
              if (isTextEditing) {
                // Check if this is a navigation link - if so, block it
                let clickedElement = e.target;
                while (clickedElement && clickedElement !== document.body) {
                  if (clickedElement.tagName === 'A' && clickedElement.href) {
                    console.log('Preventing navigation - text editing is active');
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                  }
                  clickedElement = clickedElement.parentElement;
                }
                // If not a link, allow element selection to proceed
              }
              
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

              // Professional selection: Mark new selection in progress
              selectionState.isSelecting = true;
              selectionState.selectionTimestamp = Date.now();
              const newSelectionId = 'selected-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
              selectionState.lastSelectionId = newSelectionId;
              
              // Clear any pending lock timeout
              clearSelectionLock();
              
              clickedElement.dataset.vibecanvasId = newSelectionId;
              selectedElement = clickedElement;
              window.currentSelectedElement = selectedElement;
              window.currentSelectedElementId = newSelectionId;

              highlightElement(selectedElement);
              
              // Send selection to parent (inspector is enabled at this point)
              console.log('Element clicked in inspector mode:', selectedElement.tagName, selectedElement.className);
              
              // Find child text elements for containers
              const childTextElements = [];
                
                // Get all descendant elements that contain text
                const allElements = selectedElement.querySelectorAll('*');
                allElements.forEach((el) => {
                  const hasText = el.textContent && el.textContent.trim().length > 0;
                  const isTextTag = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'SPAN', 'A', 'STRONG', 'EM', 'B', 'I'].includes(el.tagName);
                  const isLeafElement = el.children.length === 0;
                  
                  // Include if it's a text tag OR a leaf element with text
                  if (hasText && (isTextTag || isLeafElement)) {
                    const textContent = el.textContent.trim();
                    
                    // Avoid duplicates and very short text
                    if (textContent.length > 2) {
                      // Check if this text is already included in a parent element we've added
                      const isDuplicate = childTextElements.some(existing => 
                        existing.textContent.includes(textContent) || textContent.includes(existing.textContent)
                      );
                      
                      if (!isDuplicate) {
                        childTextElements.push({
                          tagName: el.tagName,
                          id: el.id || '',
                          className: el.className || '',
                          textContent: textContent
                        });
                      }
                    }
                  }
                });
                
                console.log('Found child text elements in iframe (visible only):', childTextElements);
                
                // Send selection to parent (simplified for navigation fix)
                window.parent.postMessage({
                  type: 'ELEMENT_SELECTED',
                  element: {
                    tagName: selectedElement.tagName.toLowerCase(),
                    id: selectedElement.id || '',
                    className: selectedElement.className || '',
                    textContent: selectedElement.textContent?.trim() || '',
                    uniqueId: selectedElement.dataset.vibecanvasId,
                    childTextElements: childTextElements
                  }
                }, '*');
            };
            
            // Professional: Only attach inspector click handler when inspector is enabled
            if (inspectorEnabled && inspectorScriptActive) {
              // Remove old handler if it exists
              if (window.vibecanvasInspectorClickHandler) {
                document.removeEventListener('click', window.vibecanvasInspectorClickHandler, true);
              }
              // Add the inspector click event listener ONLY if inspector is enabled
              if (inspectorEnabled && inspectorScriptActive) {
            document.addEventListener('click', window.vibecanvasInspectorClickHandler, true);
                console.log('Attached inspector script click handler');
              } else {
                console.log('Not attaching inspector script click handler - inspector disabled');
              }
            } else {
              // Inspector is disabled - ensure handler is removed
              if (window.vibecanvasInspectorClickHandler) {
                document.removeEventListener('click', window.vibecanvasInspectorClickHandler, true);
                console.log('Removed inspector script click handler (inspector disabled)');
              }
            }
            
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
                const wasEnabled = inspectorEnabled;
                inspectorEnabled = e.data.isInspecting;
                inspectorScriptActive = e.data.isInspecting;
                
                // Professional: Manage inspector script click handler immediately
                if (!inspectorEnabled) {
                  // Remove handler when inspector is off
                  if (window.vibecanvasInspectorClickHandler) {
                    document.removeEventListener('click', window.vibecanvasInspectorClickHandler, true);
                    console.log('Removed inspector script click handler (inspector disabled)');
                  }
                } else if (inspectorEnabled && !wasEnabled) {
                  // Inspector just enabled - handler will be attached when script runs
                  console.log('Inspector enabled - handler will be attached');
                }
                
                // Clean up when disabling inspector
                if (!inspectorEnabled && wasEnabled) {
                  console.log('Inspector disabled - cleaning up');
                  
                  // Hide and clean up highlight
                  if (highlightDiv) {
                    highlightDiv.style.display = 'none';
                    highlightDiv.style.visibility = 'hidden';
                    highlightDiv.style.opacity = '0';
                  }
                  
                  // Clear selection state
                  selectedElement = null;
                  window.currentSelectedElement = null;
                  window.currentSelectedElementId = null;
                  window.lastHighlightedElement = null;
                  
                  // Clear any pending animations
                  if (animationFrameId) {
                    cancelAnimationFrame(animationFrameId);
                    animationFrameId = null;
                  }
                  
                  // Clear hover timeout
                  if (hoverTimeout) {
                    clearTimeout(hoverTimeout);
                    hoverTimeout = null;
                  }
                  
                  // Notify parent that selection is cleared
                  window.parent.postMessage({
                    type: 'ELEMENT_SELECTED',
                    element: null
                  }, '*');
                  
                  console.log('Inspector disabled - cleanup complete');
                } else if (inspectorEnabled && !wasEnabled) {
                  console.log('Inspector enabled - activating');
                }
              } else if (e.data.type === 'SET_TEXT_EDITING_MODE') {
                console.log('Setting text editing mode:', e.data.isTextEditing);
                isTextEditing = e.data.isTextEditing;
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
        // Professional: Store old URL to revoke AFTER new one loads
        const oldBlobUrl = iframe.dataset.blobUrl;
        
        // Set new blob URL BEFORE revoking old one
        iframe.dataset.blobUrl = url
        
        // Professional: Set loading state for navigation
        setHasError(false)
        
        // Set new src FIRST (before revoking old URL)
        // Clear any existing onload handlers to prevent conflicts
        iframe.onload = null;
        
        // Set the new src
        iframe.src = url;
        
        // NOW revoke old URL (after new src is set, with delay to ensure new URL starts loading)
        if (oldBlobUrl) {
          setTimeout(() => {
            try {
              URL.revokeObjectURL(oldBlobUrl);
            } catch (e) {
              console.warn('Error revoking old blob URL:', e);
            }
          }, 1000); // Increased delay to ensure new URL has fully loaded
        }
        
        // Re-send inspector state after iframe loads
        const handleNavigationLoad = () => {
          // Clear the timeout since we loaded successfully
          if (iframe.dataset.loadTimeout) {
            clearTimeout(parseInt(iframe.dataset.loadTimeout));
            delete iframe.dataset.loadTimeout;
          }
          
          // Clear loading state after successful load
          setIsLoading(false);
          
          setTimeout(() => {
            if (iframe.contentWindow) {
              const stateToSend = currentParentInspectorStateRef.current !== undefined ? currentParentInspectorStateRef.current : currentInspectorStateRef.current
              iframe.contentWindow.postMessage({
                type: 'SET_INSPECTOR_MODE',
                isInspecting: stateToSend
              }, '*');
            }
          }, 100); // Small delay to ensure iframe is ready
        };
        
        // Set onload handler
        iframe.onload = handleNavigationLoad;
        
        // If iframe is already loaded (same URL or cached), trigger handler manually
        try {
          const docReady = iframe.contentDocument?.readyState;
          const winDocReady = iframe.contentWindow?.document?.readyState;
          
          if (docReady === 'complete' || winDocReady === 'complete') {
            setTimeout(handleNavigationLoad, 50);
          }
        } catch (e) {
          // Will wait for onload event
        }
        
        // Handle loading errors
        iframe.onerror = (error) => {
          console.error('Iframe loading error:', error);
          // Clear timeout on error
          if (iframe.dataset.loadTimeout) {
            clearTimeout(parseInt(iframe.dataset.loadTimeout));
            delete iframe.dataset.loadTimeout;
          }
          setIsLoading(false)
          setHasError(true)
        }
        
        // Fallback: Clear loading state after timeout (in case onload doesn't fire)
        const loadTimeout = setTimeout(() => {
          console.warn('Iframe load timeout - clearing loading state');
          setIsLoading(false);
        }, 3000); // 3 second timeout
        
        // Store timeout ID to clear it if onload fires
        iframe.dataset.loadTimeout = loadTimeout;
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
      // Cleanup debounce timeout
      if (reloadDebounceRef.current) {
        clearTimeout(reloadDebounceRef.current)
        reloadDebounceRef.current = null
      }
      // Cleanup navigation throttle
      if (navigationThrottleRef.current) {
        clearTimeout(navigationThrottleRef.current)
        navigationThrottleRef.current = null
      }
      window.removeEventListener('message', handleMessage)
      if (iframe && handleLoad) {
        iframe.removeEventListener('load', handleLoad)
      }
      // CRITICAL FIX: Only revoke old URL, not the new one
      // The new URL is handled in the load handler above
      // If oldBlobUrl exists, it was already revoked in load handler, so skip here
      // Only revoke if URL wasn't handled by load handler (e.g., component unmounting)
      if (oldBlobUrl && oldBlobUrl !== url) {
        // Old URL will be revoked in load handler, skip here
        console.log('Cleanup: Old blob URL will be revoked by load handler');
      } else if (url) {
        // If no old URL (first load) or component unmounting, revoke this URL
        // But wait a bit to ensure iframe has loaded
        setTimeout(() => {
          try {
            URL.revokeObjectURL(url);
            console.log('Cleanup: Revoked blob URL (no old URL or unmounting)');
          } catch (e) {
            console.warn('Error revoking blob URL in cleanup:', e);
          }
        }, 2000); // Longer delay for unmount case
      }
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
      <div className="preview-content">
        {/* Loading Overlay */}
        {isLoading && (
          <div className="preview-loading-overlay">
            <div className="loading-skeleton">
              <div className="skeleton-header"></div>
              <div className="skeleton-nav"></div>
              <div className="skeleton-content">
                <div className="skeleton-line"></div>
                <div className="skeleton-line"></div>
                <div className="skeleton-line short"></div>
              </div>
            </div>
            <div className="loading-spinner">
              <div className="spinner"></div>
              <span>Loading preview...</span>
            </div>
          </div>
        )}
        
        {/* Error State */}
        {hasError && (
          <div className="preview-error-overlay">
            <div className="error-content">
              <span className="error-icon">⚠️</span>
              <h4>Preview Error</h4>
              <p>There was an issue loading the preview. Please try refreshing.</p>
              <button onClick={() => {
                setHasError(false)
                setIsLoading(true)
                if (iframeRef.current) {
                  iframeRef.current.src = iframeRef.current.src // Reload iframe
                }
              }}>
                Retry
              </button>
            </div>
          </div>
        )}
        
        <iframe
          ref={iframeRef}
          title="Preview"
          className={`preview-iframe ${isLoading ? 'loading' : ''}`}
          sandbox="allow-scripts allow-same-origin allow-forms"
        />
        <GridOverlay 
          gridType={gridOverlay} 
          isVisible={gridOverlay !== 'none'}
          gridColor={gridColor}
        />
      </div>
    </div>
  )
})

PreviewPane.displayName = 'PreviewPane'

export default PreviewPane

