import { useRef, useState, useEffect, useMemo, Fragment } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { listProjects, loadProject, deleteProject, softDeleteProject, restoreProject } from '../services/projectService'
import './FileUploader.css'

function FileUploader({ onProjectLoad }) {
  // Auth state - must be declared first
  const { user, signIn, signUp, signOut } = useAuth()
  
  // Helper function to load cached projects (only active projects, not deleted ones)
  const getCachedProjects = () => {
    try {
      const stored = localStorage.getItem('vibecanvas_all_projects_cache')
      if (stored) {
        const cachedData = JSON.parse(stored)
        if (cachedData.projects && Array.isArray(cachedData.projects)) {
          // Get list of deleted project IDs from localStorage
          let deletedProjectIds = new Set()
          try {
            const deletedStored = localStorage.getItem('vibecanvas_recently_deleted_projects')
            if (deletedStored) {
              const deletedData = JSON.parse(deletedStored)
              if (Array.isArray(deletedData)) {
                deletedData.forEach(deleted => {
                  if (deleted.projectId) {
                    deletedProjectIds.add(deleted.projectId)
                  }
                })
              }
            }
          } catch (e) {
            // Ignore errors reading deleted projects
          }
          
          // Filter out deleted projects from cache
          // A project is deleted if:
          // 1. It has a deletedAt timestamp (valid ISO date string)
          // 2. Its projectId is in the recently deleted list
          const activeProjects = cachedData.projects.filter(project => {
            // Check if project has deletedAt timestamp
            const deletedAt = project.deletedAt || project.deleted_at
            const hasDeletedTimestamp = deletedAt && (
              deletedAt !== null && 
              deletedAt !== undefined && 
              deletedAt !== '' &&
              (typeof deletedAt === 'string' && deletedAt.length > 0 && !isNaN(Date.parse(deletedAt)))
            )
            
            // Check if project ID is in deleted list
            const isInDeletedList = project.projectId && deletedProjectIds.has(project.projectId)
            
            // Project is active if it doesn't have a deleted timestamp AND is not in deleted list
            return !hasDeletedTimestamp && !isInDeletedList
          })
          
          console.log('📦 Loaded cache during init:', activeProjects.length, 'active (filtered from', cachedData.projects.length, 'total)')
          return activeProjects
        }
      }
    } catch (e) {
      // Ignore errors
    }
    return []
  }
  
  // Initialize both ref and state from cache in ONE go (synchronous, before first render)
  // This ensures cache is available immediately on first render, preventing any flash
  const cachedProjects = getCachedProjects()
  const displayProjectsRef = useRef(cachedProjects)
  
  // Initialize state directly from cache (synchronous, available on first render)
  const [isDragging, setIsDragging] = useState(false)
  const [allProjects, setAllProjects] = useState(cachedProjects)
  
  // Create a display state that always has data if ref has data (prevents flash)
  // Use useMemo to prevent recalculation on every render
  const displayProjects = useMemo(() => {
    return allProjects.length > 0 ? allProjects : (displayProjectsRef.current || [])
  }, [allProjects])
  
  // Keep ref and state in sync - update ref whenever state changes
  useEffect(() => {
    if (allProjects.length > 0) {
      displayProjectsRef.current = allProjects
    }
  }, [allProjects])
  const [recentlyDeletedProjects, setRecentlyDeletedProjects] = useState(() => {
    // Initialize from cache synchronously
    try {
      const stored = localStorage.getItem('vibecanvas_recently_deleted_projects')
      if (stored) {
        const data = JSON.parse(stored)
        if (Array.isArray(data) && data.length > 0) {
          if (typeof data[0] === 'string') {
            // Old format - convert to new format
            return data.map(id => ({ projectId: id, deletedAt: Date.now() }))
          } else {
            // New format
            return data
          }
        }
      }
    } catch (e) {
      // Ignore errors, just return empty array
    }
    return []
  })
  const [activeTab, setActiveTab] = useState('all') // 'all' or 'deleted'
  const [selectedProjects, setSelectedProjects] = useState(new Set())
  const [showFilesInfo, setShowFilesInfo] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, right: 0 })
  const folderInputRef = useRef(null)
  const fileInputRef = useRef(null)
  const openFilesButtonRef = useRef(null)
  
  // Delete confirmation modal state
  const [deleteModal, setDeleteModal] = useState({ show: false, project: null, isPermanent: false })
  const recentlyDeletedIdsRef = useRef(new Set())
  const pauseRefreshRef = useRef(false)
  const hasLoadedFromCacheRef = useRef(false) // Track if we've loaded from cache
  const isInitialLoadRef = useRef(true) // Track if this is the initial load
  
  // Initialize recentlyDeletedIdsRef from cached data
  useEffect(() => {
    if (recentlyDeletedProjects.length > 0) {
      recentlyDeletedIdsRef.current = new Set(recentlyDeletedProjects.map(p => p.projectId))
    }
    // Mark that we've loaded from cache
    if (allProjects.length > 0) {
      hasLoadedFromCacheRef.current = true
    }
  }, []) // Only run once on mount
  
  // Verify cached data is for current user (runs when user becomes available)
  // Don't clear state immediately - wait for fresh data to prevent flash
  useEffect(() => {
    if (user) {
      // Verify all projects cache is for current user
      try {
        const stored = localStorage.getItem('vibecanvas_all_projects_cache')
        if (stored) {
          const cachedData = JSON.parse(stored)
          // If cache is for a different user, clear localStorage but keep state visible
          // until fresh data loads (prevents flash)
          if (cachedData.userId !== user.id) {
            localStorage.removeItem('vibecanvas_all_projects_cache')
            // Clear the ref so we know to update when fresh data arrives
            hasLoadedFromCacheRef.current = false
            // Don't clear state - let loadAllProjects update it with fresh data
          } else {
            // Cache is for correct user - mark that we have valid cached data
            hasLoadedFromCacheRef.current = true
          }
        }
      } catch (e) {
        // Ignore errors
      }
    } else {
      // User logged out - clear cache but keep state visible during transition
      // Only clear state if we're sure user is actually logged out (not just loading)
      // This prevents flash during auth state changes
      localStorage.removeItem('vibecanvas_all_projects_cache')
      hasLoadedFromCacheRef.current = false
      // Don't clear state immediately - let it persist until component unmounts or user logs in
    }
  }, [user])
  
  // Save recently deleted projects to localStorage whenever it changes
  useEffect(() => {
    if (recentlyDeletedProjects.length > 0) {
      localStorage.setItem('vibecanvas_recently_deleted_projects', JSON.stringify(recentlyDeletedProjects))
      recentlyDeletedIdsRef.current = new Set(recentlyDeletedProjects.map(p => p.projectId))
    } else {
      localStorage.removeItem('vibecanvas_recently_deleted_projects')
      recentlyDeletedIdsRef.current = new Set()
    }
  }, [recentlyDeletedProjects])
  
  // Save all projects to localStorage cache whenever it changes (for instant load on refresh)
  useEffect(() => {
    if (user && allProjects.length > 0) {
      const cacheData = {
        userId: user.id,
        projects: allProjects,
        timestamp: Date.now()
      }
      localStorage.setItem('vibecanvas_all_projects_cache', JSON.stringify(cacheData))
    } else if (!user) {
      // Clear cache when user logs out
      localStorage.removeItem('vibecanvas_all_projects_cache')
    }
  }, [allProjects, user])
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  
  // Check for deleted_at column on mount and show migration notice if needed
  useEffect(() => {
    const checkColumn = async () => {
      try {
        const { data, error } = await listProjects(user?.id || '')
        if (error && error.message?.includes('deleted_at')) {
          console.warn('⚠️ deleted_at column missing. Run this SQL in Supabase SQL Editor:')
          console.warn('ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;')
        }
      } catch (e) {
        // Ignore - will be handled by loadAllProjects
      }
    }
    if (user) {
      checkColumn()
    }
  }, [user])
  
  // Load all projects from user account (Supabase) - All Projects is the source of truth
  const loadAllProjects = async () => {
    // If no user yet, use cache immediately (don't fetch from Supabase)
    // This ensures cached data displays immediately on first render
    if (!user) {
      const cached = getCachedProjects()
      if (cached.length > 0) {
        // Update display ref and state with cached data
        displayProjectsRef.current = cached
        setAllProjects(cached)
        hasLoadedFromCacheRef.current = true
        console.log('Loaded projects from cache (user not loaded yet):', cached.length)
      } else {
        // No cache available, keep empty state
        if (!hasLoadedFromCacheRef.current && allProjects.length === 0) {
          setAllProjects([])
        }
      }
      return
    }
    
    // Mark that initial load is complete
    isInitialLoadRef.current = false
    
    // Skip refresh if we just deleted something (pause for 5 seconds)
    if (pauseRefreshRef.current) {
      console.log('Skipping refresh - pause active after delete')
      return
    }
    
    try {
      const projects = await listProjects(user.id)
      
      // Format projects for display
      const allFormatted = projects.map(project => ({
        name: project.name,
        fileCount: project.fileCount || 0,
        path: project.name,
        isFolder: true,
        lastSaved: project.updated_at || project.created_at,
        projectId: project.id,
        deletedAt: project.deleted_at // Include deleted_at from database if available
      }))
      
      // Read recently deleted projects from localStorage to get the latest state
      // This ensures we have the most up-to-date list even if state hasn't updated yet
      let currentDeletedProjects = recentlyDeletedProjects
      try {
        const stored = localStorage.getItem('vibecanvas_recently_deleted_projects')
        if (stored) {
          const data = JSON.parse(stored)
          if (Array.isArray(data) && data.length > 0) {
            if (typeof data[0] === 'object' && data[0].projectId) {
              currentDeletedProjects = data
            }
          }
        }
      } catch (e) {
        console.error('Error reading recently deleted from localStorage:', e)
      }
      
      // Filter out projects that are deleted
      // Priority: Use database deleted_at if available, otherwise fall back to localStorage
      const deletedIds = new Set()
      
      // First, add projects that have deleted_at set in the database (timestamp string = deleted)
      allFormatted.forEach(project => {
        // deletedAt will be:
        // - a timestamp string if deleted (e.g., "2024-01-01T00:00:00Z")
        // - null if restored/active
        // - undefined if column doesn't exist
        if (project.deletedAt && typeof project.deletedAt === 'string') {
          // Project is deleted in database
          deletedIds.add(project.projectId)
        }
      })
      
      // Then, add projects from localStorage ONLY if deleted_at column doesn't exist in DB
      // (for backwards compatibility - if column exists, DB is source of truth)
      currentDeletedProjects.forEach(deleted => {
        const dbProject = allFormatted.find(p => p.projectId === deleted.projectId)
        // Only use localStorage entry if:
        // 1. The project exists in DB
        // 2. The deleted_at column doesn't exist (undefined) - meaning we're using localStorage as fallback
        // If deleted_at is null in DB, that means it's restored, so don't use localStorage
        if (dbProject && dbProject.deletedAt === undefined) {
          // Column doesn't exist, use localStorage
          deletedIds.add(deleted.projectId)
        }
      })
      
      // Also check recentlyDeletedIdsRef to filter out optimistically deleted projects
      // This ensures projects deleted optimistically are filtered out even if DB hasn't updated yet
      // If a project is in recentlyDeletedIdsRef, filter it out immediately (optimistic delete)
      recentlyDeletedIdsRef.current.forEach(deletedId => {
        if (!deletedIds.has(deletedId)) {
          // Project is optimistically deleted - filter it out even if DB hasn't updated yet
          deletedIds.add(deletedId)
        }
      })
      
      const activeProjects = allFormatted.filter(project => !deletedIds.has(project.projectId))
      
      // Update recently deleted projects with current data from Supabase
      // Only show projects in Recently Deleted if they still exist in Supabase AND are still deleted
      // Important: Filter out projects that have been restored (deleted_at is null in database)
      const deletedProjectsWithData = currentDeletedProjects.map(deleted => {
        const currentProject = allFormatted.find(p => p.projectId === deleted.projectId)
        if (currentProject) {
          // Check if project has been restored (deleted_at is null in database)
          const deletedAt = currentProject.deletedAt || currentProject.deleted_at
          const isRestored = !deletedAt || deletedAt === null || deletedAt === undefined || deletedAt === ''
          
          // If project has been restored, don't include it in Recently Deleted
          if (isRestored) {
            return null // Will be filtered out
          }
          
          // Project is still deleted - update with current data from Supabase, keep deletedAt timestamp
          return {
            ...currentProject,
            deletedAt: deleted.deletedAt || currentProject.deletedAt || Date.now()
          }
        }
        // Project might not exist in Supabase anymore, but keep it in Recently Deleted
        return deleted
      }).filter(p => p && p.name && p.projectId) // Filter out nulls and invalid projects
      
      // Always update display ref FIRST (before state) to prevent flash
      // This ensures the ref always has the latest data immediately
      // BUT: Don't overwrite if we have optimistically deleted projects
      // If recentlyDeletedIdsRef has projects, make sure they're filtered out
      const finalActiveProjects = activeProjects.filter(p => {
        // Double-check: if project is in recentlyDeletedIdsRef, filter it out
        // This ensures optimistically deleted projects stay filtered even if DB hasn't updated
        return !recentlyDeletedIdsRef.current.has(p.projectId)
      })
      
      if (finalActiveProjects.length > 0) {
        displayProjectsRef.current = finalActiveProjects
        setAllProjects(finalActiveProjects)
        hasLoadedFromCacheRef.current = false // Mark that we now have fresh data
      } else {
        // If fresh data is empty, keep the ref with cached data (don't clear it)
        // Only clear state if we truly have no cached data
        if (!hasLoadedFromCacheRef.current || displayProjectsRef.current.length === 0) {
          displayProjectsRef.current = []
          setAllProjects([])
        }
        // Otherwise, keep showing cached data in ref, don't update state
        hasLoadedFromCacheRef.current = false
      }
      // Update recently deleted projects - preserve all projects, even with same names
      // Merge: keep existing projects and update with fresh data from Supabase
      setRecentlyDeletedProjects(prev => {
        // Create a map of existing projects by ID for quick lookup
        const existingMap = new Map(prev.map(p => [p.projectId, p]))
        
        // Update existing projects with fresh data from Supabase, or keep them as-is
        const updated = deletedProjectsWithData.map(deleted => {
          const existing = existingMap.get(deleted.projectId)
          if (existing) {
            // Merge: use fresh data from Supabase but preserve deletedAt timestamp
            return {
              ...deleted,
              deletedAt: existing.deletedAt || deleted.deletedAt || Date.now()
            }
          }
          return deleted
        })
        
        // Add any projects from prev that aren't in deletedProjectsWithData
        // (in case they were deleted but don't exist in Supabase anymore)
        prev.forEach(existing => {
          if (!updated.find(p => p.projectId === existing.projectId)) {
            updated.push(existing)
          }
        })
        
        // Check if there are actual changes
        const prevIds = new Set(prev.map(p => p.projectId))
        const newIds = new Set(updated.map(p => p.projectId))
        const hasChanges = prevIds.size !== newIds.size || ![...prevIds].every(id => newIds.has(id)) ||
          prev.some(p => {
            const updatedP = updated.find(up => up.projectId === p.projectId)
            return !updatedP || updatedP.name !== p.name || updatedP.deletedAt !== p.deletedAt
          })
        
        if (hasChanges) {
          console.log('Updated Recently Deleted:', {
            prevCount: prev.length,
            newCount: updated.length,
            projects: updated.map(p => ({ name: p.name, id: p.projectId }))
          })
          return updated
        }
        return prev
      })
      
      console.log('Loaded projects:', {
        totalFromSupabase: projects.length,
        active: activeProjects.length,
        deleted: deletedProjectsWithData.length
      })
    } catch (error) {
      console.error('Error loading all projects:', error)
      // Don't clear projects on error - keep cached data visible
      // This prevents the flash of empty state if network request fails
      // The cached data will remain visible until next successful load
    }
  }
  
  // Restore a project from recently deleted
  const handleRestoreProject = async (projectId) => {
    if (!user) {
      alert('Please sign in to restore projects')
      return
    }
    
    try {
      // Update database to clear deleted_at (restore the project)
      await restoreProject(projectId, user.id)
      console.log('✅ Project restored in database:', projectId)
      
      // Remove from recently deleted list in state and localStorage
      setRecentlyDeletedProjects(prev => {
        const updated = prev.filter(p => p.projectId !== projectId)
        // Update localStorage
        if (updated.length > 0) {
          localStorage.setItem('vibecanvas_recently_deleted_projects', JSON.stringify(updated))
        } else {
          localStorage.removeItem('vibecanvas_recently_deleted_projects')
        }
        return updated
      })
      
      // Clear selection for this project
      setSelectedProjects(prev => {
        const newSet = new Set(prev)
        newSet.delete(projectId)
        return newSet
      })
      
      // Reload projects to show restored project in All Projects
      await loadAllProjects()
    } catch (error) {
      console.error('❌ Error restoring project:', error)
      alert(`Failed to restore project: ${error.message || 'Unknown error'}`)
    }
  }
  
  // Restore multiple projects
  const handleRestoreSelected = async () => {
    if (!user) {
      alert('Please sign in to restore projects')
      return
    }
    
    const selectedArray = Array.from(selectedProjects)
    if (selectedArray.length === 0) {
      return
    }
    
    try {
      // Restore all selected projects in database
      await Promise.all(selectedArray.map(id => restoreProject(id, user.id)))
      console.log('✅ Restored', selectedArray.length, 'project(s) in database')
      
      // Remove from recently deleted list
      setRecentlyDeletedProjects(prev => {
        const updated = prev.filter(p => !selectedProjects.has(p.projectId))
        // Update localStorage
        if (updated.length > 0) {
          localStorage.setItem('vibecanvas_recently_deleted_projects', JSON.stringify(updated))
        } else {
          localStorage.removeItem('vibecanvas_recently_deleted_projects')
        }
        return updated
      })
      
      // Clear all selections
      setSelectedProjects(new Set())
      
      // Reload projects to show restored projects in All Projects
      await loadAllProjects()
    } catch (error) {
      console.error('❌ Error restoring projects:', error)
      alert(`Failed to restore projects: ${error.message || 'Unknown error'}`)
    }
  }
  
  // Permanently delete a project
  const handlePermanentDelete = async (projectId) => {
    try {
      await deleteProject(projectId, user.id)
      setRecentlyDeletedProjects(prev => prev.filter(p => p.projectId !== projectId))
      setSelectedProjects(prev => {
        const newSet = new Set(prev)
        newSet.delete(projectId)
        return newSet
      })
      console.log('✅ Project permanently deleted')
    } catch (error) {
      console.error('❌ Error permanently deleting project:', error)
      alert(`Failed to permanently delete project: ${error.message || 'Unknown error'}`)
    }
  }
  
  // Permanently delete multiple projects
  const handlePermanentDeleteSelected = async () => {
    const selectedArray = Array.from(selectedProjects)
    try {
      await Promise.all(selectedArray.map(id => deleteProject(id, user.id)))
      setRecentlyDeletedProjects(prev => prev.filter(p => !selectedProjects.has(p.projectId)))
      setSelectedProjects(new Set())
      console.log('✅ Permanently deleted', selectedArray.length, 'project(s)')
    } catch (error) {
      console.error('❌ Error permanently deleting projects:', error)
      alert(`Failed to permanently delete projects: ${error.message || 'Unknown error'}`)
    }
  }
  
  // Toggle project selection
  const handleToggleSelection = (projectId) => {
    setSelectedProjects(prev => {
      const newSet = new Set(prev)
      if (newSet.has(projectId)) {
        newSet.delete(projectId)
      } else {
        newSet.add(projectId)
      }
      return newSet
    })
  }
  
  // Select all visible projects
  const handleSelectAll = () => {
    const projects = activeTab === 'all' 
      ? displayProjects
      : recentlyDeletedProjects
    const allIds = new Set(projects.map(p => p.projectId))
    setSelectedProjects(allIds)
  }
  
  // Deselect all
  const handleDeselectAll = () => {
    setSelectedProjects(new Set())
  }

  // Load all projects on mount and when user changes
  useEffect(() => {
    console.log('🔄 FileUploader useEffect triggered. User:', user?.id)
    
    // If user exists, fetch fresh data (cache is already visible from initialization)
    // Cache was loaded synchronously during component initialization, so it's already displayed
    if (user) {
      // Small delay to let cached data render first, then fetch fresh data
      const timeoutId = setTimeout(() => {
        loadAllProjects()
      }, 200)
      
      // Set up refresh interval
      const interval = setInterval(() => {
        loadAllProjects()
      }, 5000) // Refresh every 5 seconds
      
      return () => {
        clearTimeout(timeoutId)
        clearInterval(interval)
      }
    }
    // If no user, cache is already loaded during initialization, nothing to do
  }, [user]) // Re-run when user logs in/out

  // Refresh all projects periodically (to catch new saves) - only if user is logged in
  // Note: This is now handled in the main useEffect above with a 5-second interval

  // Handle 'i' key press to toggle info tooltip
  useEffect(() => {
    const handleKeyPress = (e) => {
      // Only trigger if 'i' is pressed and no input is focused
      if ((e.key === 'i' || e.key === 'I') && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        setShowFilesInfo(prev => !prev)
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [])

  // Removed saveToRecentProjects, openRecentProject, removeRecentProject - no longer needed
  // Projects are now only loaded from file system

  const handleAuthSubmit = async (e) => {
    e.preventDefault()
    setAuthError('')
    setAuthLoading(true)

    try {
      if (isLogin) {
        const { error } = await signIn(email, password)
        if (error) throw error
        // Clear form on success
        setEmail('')
        setPassword('')
      } else {
        const { error } = await signUp(email, password)
        if (error) throw error
        // Clear form on success - user is automatically logged in
        setEmail('')
        setPassword('')
      }
    } catch (err) {
      setAuthError(err.message)
    } finally {
      setAuthLoading(false)
    }
  }

  const handleSignOut = async () => {
    await signOut()
    setEmail('')
    setPassword('')
    setAuthError('')
  }

  const readFiles = async (files, isFolder = true) => {
    const projectFiles = []
    
    console.log('FileUploader: Reading files', {
      totalFiles: files.length,
      fileNames: Array.from(files).map(f => f.name)
    })
    
    for (const file of files) {
      const isTextFile = file.name.endsWith('.html') ||
                        file.name.endsWith('.css') ||
                        file.name.endsWith('.js');
      
      const isImageFile = file.name.endsWith('.jpg') ||
                         file.name.endsWith('.jpeg') ||
                         file.name.endsWith('.png') ||
                         file.name.endsWith('.gif') ||
                         file.name.endsWith('.webp') ||
                         file.name.endsWith('.svg');
      
      if (isTextFile || isImageFile) {
        try {
          let content;
          let dataUrl = null;
          
          if (isImageFile) {
            // Convert image to base64 data URL for persistence across page reloads
            // Using FileReader for proper base64 encoding
            dataUrl = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
            content = dataUrl;
          } else {
            content = await file.text();
          }
          
          const extension = file.name.split('.').pop().toLowerCase()
          let fileType = extension
          
          if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension)) {
            fileType = extension === 'svg' ? 'svg' : 
                       ['jpg', 'jpeg'].includes(extension) ? 'jpg' : extension
          }
          
          projectFiles.push({
            name: file.name,
            path: file.webkitRelativePath || file.name,
            content: content,
            type: fileType,
            isImage: isImageFile,
            dataUrl: dataUrl
          })
          console.log(`Loaded file: ${file.name} (${isImageFile ? 'image' : content.length + ' chars'})`)
        } catch (error) {
          console.error(`Error reading file ${file.name}:`, error)
        }
      } else {
        console.log(`Skipping file: ${file.name} (not supported file type)`)
      }
    }
    
    const htmlCount = projectFiles.filter(f => f.type === 'html').length
    const cssCount = projectFiles.filter(f => f.type === 'css').length
    
    console.log('FileUploader: Loaded files summary', {
      total: projectFiles.length,
      html: htmlCount,
      css: cssCount,
      js: projectFiles.filter(f => f.type === 'js').length,
      images: projectFiles.filter(f => f.isImage).length,
      fileNames: projectFiles.map(f => f.name)
    })
    
    // Warn if HTML files but no CSS files
    if (htmlCount > 0 && cssCount === 0) {
      console.warn('⚠️ HTML file(s) loaded but no CSS files found. Styling may not work correctly.')
      console.warn('💡 TIP: When opening individual files, select BOTH your HTML and CSS files together (hold Cmd/Ctrl to select multiple).')
    }
    
    if (projectFiles.length > 0) {
      // Extract folder name from file paths if loading a folder
      let folderName = null
      if (isFolder && projectFiles.length > 0) {
        // Get the first file's path and extract folder name
        const firstPath = projectFiles[0].path
        if (firstPath && firstPath.includes('/')) {
          // Extract folder name from path (e.g., "my-project/index.html" -> "my-project")
          folderName = firstPath.split('/')[0]
        } else if (firstPath && firstPath.includes('\\')) {
          // Handle Windows paths
          folderName = firstPath.split('\\')[0]
        }
      }
      
      // Don't save here - App.jsx will handle all local saves
      // This prevents duplicate entries in recent projects
      onProjectLoad(projectFiles, false, folderName) // false = not from All Projects, folderName = default name
    } else {
      console.warn('No valid files found to load')
    }
  }

  const handleDrop = async (e) => {
    e.preventDefault()
    setIsDragging(false)
    
    const items = Array.from(e.dataTransfer.items)
    const files = []
    
    for (const item of items) {
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null
        if (entry) {
          if (entry.isFile) {
            files.push(item.getAsFile())
          } else if (entry.isDirectory) {
            alert('Please use "Open Project" to upload folders with subdirectories.')
            return
          }
        } else {
          const file = item.getAsFile()
          if (file) files.push(file)
        }
      }
    }
    
    const directFiles = Array.from(e.dataTransfer.files)
    directFiles.forEach(file => {
      if (!files.find(f => f.name === file.name && f.size === file.size)) {
        files.push(file)
      }
    })
    
    // Drag and drop is typically individual files, not folders
    await readFiles(files, false)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleFolderSelect = async (e) => {
    const files = Array.from(e.target.files)
    await readFiles(files, true) // true = isFolder
  }

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files)
    await readFiles(files, false) // false = isFolder (individual files)
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  return (
    <div
      className={`file-uploader ${isDragging ? 'dragging' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <div className="upload-container">
        <header className="upload-header">
          <div className="app-brand">
            <svg className="app-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 9h6v6H9z" />
            </svg>
            <span className="app-name">VibeCanvas</span>
          </div>
          <div className="header-actions">
            {user ? (
              <div className="header-user-info">
                <span className="header-user-email">{user.email}</span>
                <button onClick={handleSignOut} className="header-sign-out-button">
                  Sign Out
                </button>
              </div>
            ) : (
              <button 
                className="open-project-button"
                onClick={() => folderInputRef.current?.click()}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Open Project
              </button>
            )}
          </div>
        </header>

        <main className="upload-main">
          <div className="main-content">
            <h1 className="welcome-title">Welcome</h1>
            <p className="welcome-subtitle">Open a project to get started</p>
            
            <div className="welcome-info">
              <p className="welcome-info-text">
                <strong>Supported files:</strong> HTML, CSS, JavaScript (.html, .css, .js) and images (JPG, PNG, GIF, WEBP, SVG)
              </p>
            </div>

            <div className="quick-actions">
              <button 
                className="action-button"
                onClick={() => folderInputRef.current?.click()}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                Open Folder
              </button>
              <div className="action-button-wrapper">
                <div 
                  ref={openFilesButtonRef}
                  className="action-button secondary"
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      fileInputRef.current?.click()
                    }
                  }}
                  title="Select HTML, CSS, and JS files together (hold Cmd/Ctrl to select multiple)"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
                  <span>Open Files</span>
                  <button
                    className="info-button-inline"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (openFilesButtonRef.current) {
                        const rect = openFilesButtonRef.current.getBoundingClientRect()
                        const tooltipWidth = 260
                        const tooltipHeight = 200 // approximate
                        const margin = 16
                        
                        // Calculate right position, ensuring it doesn't go off screen
                        let right = window.innerWidth - rect.right
                        if (right < margin) {
                          right = margin
                        }
                        
                        // Calculate top position, ensuring it doesn't go off screen
                        let top = rect.bottom + 8
                        if (top + tooltipHeight > window.innerHeight - margin) {
                          top = rect.top - tooltipHeight - 8
                          if (top < margin) {
                            top = margin
                          }
                        }
                        
                        setTooltipPosition({ top, right })
                      }
                      setShowFilesInfo(!showFilesInfo)
                    }}
                    aria-label="Show info about opening files"
                    title="Press 'i' for info"
                  >
                    <span className="info-icon-text">i</span>
                  </button>
                </div>
                {showFilesInfo && (
                  <div 
                    className="info-tooltip"
                    style={{
                      top: `${tooltipPosition.top}px`,
                      right: `${tooltipPosition.right}px`
                    }}
                  >
                    <div className="info-tooltip-content">
                      <button 
                        className="info-tooltip-close"
                        onClick={() => setShowFilesInfo(false)}
                        aria-label="Close"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                      <h3>Opening Multiple Files</h3>
                      <p>When using "Open Files", select <strong>all your project files together</strong>:</p>
                      <ul>
                        <li>HTML files</li>
                        <li>CSS files (for styling)</li>
                        <li>JavaScript files</li>
                        <li>Images (optional)</li>
                      </ul>
                      <p><strong>Tip:</strong> Hold <kbd>Cmd</kbd> (Mac) or <kbd>Ctrl</kbd> (Windows) to select multiple files at once.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Projects Tabs */}
            <div className="projects-tabs-container">
              <div className="projects-tabs">
                <button
                  className={`projects-tab ${activeTab === 'all' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('all')
                    setSelectedProjects(new Set())
                  }}
                >
                  All Projects
                  {displayProjects.length > 0 && <span className="tab-count">({displayProjects.length})</span>}
                </button>
                <button
                  className={`projects-tab ${activeTab === 'deleted' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('deleted')
                    setSelectedProjects(new Set())
                  }}
                >
                  Recently Deleted
                  {recentlyDeletedProjects.length > 0 && <span className="tab-count">({recentlyDeletedProjects.length})</span>}
                </button>
              </div>

              {/* Bulk Actions */}
              {selectedProjects.size > 0 && (
                <div className="bulk-actions">
                  <span className="bulk-actions-count">{selectedProjects.size} selected</span>
                  {activeTab === 'all' && (
                    <button
                      className="bulk-action-button delete"
                      onClick={() => {
                        const selectedProjectsArray = Array.from(selectedProjects).map(id => {
                          // Use displayProjects to ensure we find projects even when user is loading
                          const project = displayProjects.find(p => p.projectId === id)
                          return project
                        }).filter(Boolean)
                        if (selectedProjectsArray.length > 0) {
                          setDeleteModal({ show: true, project: selectedProjectsArray[0], isPermanent: false, isBulk: true, projects: selectedProjectsArray })
                        }
                      }}
                    >
                      Delete
                    </button>
                  )}
                  {activeTab === 'deleted' && (
                    <>
                      <button
                        className="bulk-action-button restore"
                        onClick={handleRestoreSelected}
                      >
                        Restore
                      </button>
                      <button
                        className="bulk-action-button delete-permanent"
                        onClick={() => {
                          const selectedProjectsArray = Array.from(selectedProjects).map(id => {
                            const project = recentlyDeletedProjects.find(p => p.projectId === id)
                            return project
                          }).filter(Boolean)
                          if (selectedProjectsArray.length > 0 && window.confirm(`Permanently delete ${selectedProjectsArray.length} project(s)? This cannot be undone.`)) {
                            handlePermanentDeleteSelected()
                          }
                        }}
                      >
                        Permanently Delete
                      </button>
                    </>
                  )}
                  <button
                    className="bulk-action-button cancel"
                    onClick={handleDeselectAll}
                  >
                    Cancel
                  </button>
                </div>
              )}

              {activeTab === 'all' && (
                <>
                  {/* Always render container - use displayProjects which never becomes empty if ref has data */}
                  {displayProjects.length > 0 ? (
                    <div className="recent-projects">
                      <div className="projects-section-header">
                        {/* Select All / Deselect All */}
                        <div className="select-all-container">
                          {selectedProjects.size === 0 ? (
                            <button className="select-all-button" onClick={handleSelectAll}>
                              Select All
                            </button>
                          ) : (
                            <button className="select-all-button" onClick={handleDeselectAll}>
                              Deselect All
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="projects-grid">
                        {/* Use displayProjects which combines state and ref - never empty if either has data */}
                        {displayProjects.map((project, displayIndex) => {
                          const isSelected = selectedProjects.has(project.projectId)
                          return (
                        <div 
                          key={`${project.projectId}-${project.deletedAt || displayIndex}-${displayIndex}`}
                            className={`project-card ${isSelected ? 'selected' : ''}`}
                          >
                            <input
                              type="checkbox"
                              className="project-checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                e.stopPropagation()
                                handleToggleSelection(project.projectId)
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <button 
                              className="project-remove"
                              onClick={(e) => {
                                e.stopPropagation() // Prevent opening the project when clicking X
                                
                                if (!user) {
                                  alert('Please sign in to delete projects')
                                  return
                                }
                                
                                if (!project.projectId) {
                                  console.error('Project ID missing, cannot delete. Project:', project)
                                  alert('Error: Project ID missing. Cannot delete project.')
                                  return
                                }
                                
                                // Show custom confirmation modal
                                setDeleteModal({ show: true, project, isPermanent: false, isBulk: false })
                              }}
                              aria-label="Delete project"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </button>
                            <div 
                              className="project-card-content"
                              onClick={async () => {
                                if (selectedProjects.size > 0) {
                                  // If in selection mode, toggle selection instead of opening
                                  handleToggleSelection(project.projectId)
                                  return
                                }
                                if (!user) {
                                  alert('Please sign in to open projects')
                                  return
                                }
                                
                                try {
                                  // Load project from user account (Supabase)
                                  const projectData = await loadProject(project.name, user.id)
                                  
                                  // Convert to format expected by onProjectLoad
                                  const files = projectData.files.map(file => {
                                    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(file.type?.toLowerCase())
                                    const dataUrl = isImage && file.content?.startsWith('data:') ? file.content : null
                                    
                                    return {
                                      name: file.name,
                                      content: file.content,
                                      type: file.type,
                                      path: file.name,
                                      isImage: isImage,
                                      dataUrl: dataUrl
                                    }
                                  })
                                  
                                  console.log('Opening project from All Projects:', project.name, 'with', files.length, 'files')
                                  onProjectLoad(files, true, project.name) // true = loaded from All Projects, project.name = default name
                                } catch (error) {
                                  console.error('Error loading project:', error)
                                  alert('Failed to load project. Please try again.')
                                }
                              }}
                              title={`Click to open ${project.name}`}
                            >
                              <div className="project-icon">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                                </svg>
                              </div>
                          <div className="project-info">
                            <div className="project-name" title={project.name}>
                              {project.name.length > 20 ? `${project.name.substring(0, 20)}...` : project.name}
                            </div>
                            <div className="project-meta">
                              {project.fileCount} file{project.fileCount !== 1 ? 's' : ''}
                            </div>
                          </div>
                            </div>
                          </div>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="empty-state">
                      <div className="empty-icon">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                        </svg>
                      </div>
                      <p className="empty-text">No projects</p>
                      <p className="empty-hint">Open a project to get started</p>
                    </div>
                  )}
                </>
              )}

              {/* Recently Deleted Section */}
              {activeTab === 'deleted' && recentlyDeletedProjects.length > 0 ? (
                <div className="recent-projects">
                  <div className="projects-section-header">
                    <p className="section-subtitle">Projects will be permanently deleted after 30 days</p>
                    {/* Select All / Deselect All */}
                    <div className="select-all-container">
                      {selectedProjects.size === 0 ? (
                        <button className="select-all-button" onClick={handleSelectAll}>
                          Select All
                        </button>
                      ) : (
                        <button className="select-all-button" onClick={handleDeselectAll}>
                          Deselect All
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="projects-grid">
                    {recentlyDeletedProjects.map((project, displayIndex) => {
                      const isSelected = selectedProjects.has(project.projectId)
                      const deletedDate = new Date(project.deletedAt || Date.now())
                      const daysAgo = Math.floor((Date.now() - deletedDate.getTime()) / (1000 * 60 * 60 * 24))
                      return (
                        <div 
                          key={project.path || project.name || displayIndex} 
                          className={`project-card deleted ${isSelected ? 'selected' : ''}`}
                        >
                          <input
                            type="checkbox"
                            className="project-checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              e.stopPropagation()
                              // Only toggle if not already in the process of toggling
                              handleToggleSelection(project.projectId)
                            }}
                            onClick={(e) => {
                              e.stopPropagation()
                              // Prevent double-toggle
                            }}
                          />
                          <div className="project-actions">
                            <button 
                              className="project-restore"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleRestoreProject(project.projectId)
                              }}
                              aria-label="Restore project"
                              title="Restore to All Projects"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                                <path d="M21 3v5h-5" />
                                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                                <path d="M3 21v-5h5" />
                              </svg>
                            </button>
                            <button 
                              className="project-remove"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (window.confirm(`Permanently delete "${project.name}"? This cannot be undone.`)) {
                                  handlePermanentDelete(project.projectId)
                                }
                              }}
                              aria-label="Permanently delete project"
                              title="Permanently delete"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          </div>
                          <div 
                            className="project-card-content"
                            onClick={async (e) => {
                              // Don't toggle if clicking on the card content when in selection mode
                              // Only toggle if clicking the checkbox directly
                              if (selectedProjects.size > 0) {
                                // In selection mode, clicking card should toggle selection
                                // But only if not clicking on a button or interactive element
                                if (e.target.closest('button') || e.target.closest('input')) {
                                  return
                                }
                                handleToggleSelection(project.projectId)
                                return
                              }
                              // Open project without restoring it
                              if (!user) {
                                alert('Please sign in to open projects')
                                return
                              }
                              
                              try {
                                const projectData = await loadProject(project.name, user.id)
                                const files = projectData.files.map(file => {
                                  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(file.type?.toLowerCase())
                                  const dataUrl = isImage && file.content?.startsWith('data:') ? file.content : null
                                  
                                  return {
                                    name: file.name,
                                    content: file.content,
                                    type: file.type,
                                    path: file.name,
                                    isImage: isImage,
                                    dataUrl: dataUrl
                                  }
                                })
                                
                                // Open as a new project (false = not from All Projects)
                                // This makes it behave exactly like opening a new folder/project
                                // Recently Deleted is not affected at all
                                console.log('Opening project from Recently Deleted:', project.name, 'with', files.length, 'files')
                                onProjectLoad(files, false, project.name)
                              } catch (error) {
                                console.error('Error loading project:', error)
                                alert('Failed to load project. Please try again.')
                              }
                            }}
                            title={`Click to open ${project.name}`}
                          >
                            <div className="project-icon">
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                              </svg>
                            </div>
                            <div className="project-info">
                              <div className="project-name" title={project.name}>
                                {project.name.length > 20 ? `${project.name.substring(0, 20)}...` : project.name}
                              </div>
                              <div className="project-meta">
                                {(() => {
                                  const deletedDate = new Date(project.deletedAt || Date.now())
                                  const daysAgo = Math.floor((Date.now() - deletedDate.getTime()) / (1000 * 60 * 60 * 24))
                                  return `${project.fileCount} file${project.fileCount !== 1 ? 's' : ''} • Deleted ${daysAgo === 0 ? 'today' : `${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago`}`
                                })()}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : activeTab === 'deleted' ? (
                <div className="empty-state">
                  <div className="empty-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </div>
                  <p className="empty-text">No recently deleted projects</p>
                </div>
              ) : null}
            </div>

            {/* Auth Section */}
            {!user && (
            <div className="auth-section">
              <div className="auth-form-container">
                  <h3 className="auth-form-title">{isLogin ? 'Sign In' : 'Sign Up'}</h3>
                  {authError && (
                    <div className="auth-error">
                      {authError}
                    </div>
                  )}
                  <form onSubmit={handleAuthSubmit} className="auth-form">
                    <div className="auth-form-group">
                      <label htmlFor="auth-email">Email</label>
                      <input
                        id="auth-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={authLoading}
                        placeholder="your@email.com"
                      />
                    </div>
                    <div className="auth-form-group">
                      <label htmlFor="auth-password">Password</label>
                      <input
                        id="auth-password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={authLoading}
                        placeholder="••••••••"
                        minLength={6}
                      />
                    </div>
                    <button 
                      type="submit" 
                      disabled={authLoading} 
                      className="auth-submit-button"
                    >
                      {authLoading ? 'Loading...' : (isLogin ? 'Sign In' : 'Sign Up')}
                    </button>
                  </form>
                  <div className="auth-toggle">
                    {isLogin ? (
                      <>
                        Don't have an account?{' '}
                        <button 
                          onClick={() => {
                            setIsLogin(false)
                            setAuthError('')
                          }} 
                          className="auth-link"
                        >
                          Sign up
                        </button>
                      </>
                    ) : (
                      <>
                        Already have an account?{' '}
                        <button 
                          onClick={() => {
                            setIsLogin(true)
                            setAuthError('')
                          }} 
                          className="auth-link"
                        >
                          Sign in
                        </button>
                      </>
                    )}
                  </div>
                  </div>
                </div>
            )}

            <div style={{ display: 'none' }}>
              <input
                ref={folderInputRef}
                type="file"
                webkitdirectory=""
                directory=""
                multiple
                onChange={handleFolderSelect}
                style={{ display: 'none' }}
                accept=".html,.css,.js,.jpg,.jpeg,.png,.gif,.webp,.svg"
              />
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileSelect}
                style={{ display: 'none' }}
                accept=".html,.css,.js,.jpg,.jpeg,.png,.gif,.webp,.svg"
              />
            </div>
          </div>
        </main>
      </div>

      {isDragging && (
        <div className="drag-overlay">
          <div className="drag-overlay-content">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p>Drop your project folder here</p>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModal.show && deleteModal.project && (
        <div className="delete-modal-overlay" onClick={() => setDeleteModal({ show: false, project: null, isPermanent: false })}>
          <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
            <div className="delete-modal-header">
              <h3>{deleteModal.isBulk ? `Delete ${deleteModal.projects?.length || 1} Projects` : 'Delete Project'}</h3>
            </div>
            <div className="delete-modal-body">
              {deleteModal.isBulk ? (
                <>
                  <p>Are you sure you want to move <strong>{deleteModal.projects?.length || 0} project(s)</strong> to Recently Deleted?</p>
                  <p className="delete-modal-info">You can restore them later from the Recently Deleted tab.</p>
                </>
              ) : (
                <>
                  <p>Are you sure you want to move <strong>"{deleteModal.project.name}"</strong> to Recently Deleted?</p>
                  <p className="delete-modal-info">You can restore it later from the Recently Deleted tab.</p>
                </>
              )}
            </div>
            <div className="delete-modal-actions">
              <button 
                className="delete-modal-cancel"
                onClick={() => setDeleteModal({ show: false, project: null, isPermanent: false })}
              >
                Cancel
              </button>
              <button 
                className="delete-modal-confirm"
                onClick={async () => {
                  const projects = deleteModal.isBulk ? (deleteModal.projects || []) : [deleteModal.project]
                  setDeleteModal({ show: false, project: null, isPermanent: false })
                  
                  // Pause automatic refreshes briefly (just to prevent race conditions)
                  pauseRefreshRef.current = true
                  
                  try {
                    const deletedProjectsToAdd = []
                    const deletedIds = new Set()
                    
                    // Prepare deleted projects data first
                    for (const project of projects) {
                      const projectId = project.projectId
                      deletedIds.add(projectId)
                      const deletedProject = {
                        ...project,
                        deletedAt: Date.now()
                      }
                      deletedProjectsToAdd.push(deletedProject)
                    }
                    
                    // OPTIMISTIC UPDATE: Update UI immediately (feels instant!)
                    // Update ref FIRST so loadAllProjects will filter these out even if called before DB update
                    recentlyDeletedIdsRef.current = new Set([
                      ...Array.from(recentlyDeletedIdsRef.current),
                      ...Array.from(deletedIds)
                    ])
                    
                    setRecentlyDeletedProjects(prev => {
                      const updated = [...prev, ...deletedProjectsToAdd]
                      localStorage.setItem('vibecanvas_recently_deleted_projects', JSON.stringify(updated))
                      return updated
                    })
                    
                    // Remove from active projects immediately (optimistic)
                    setAllProjects(prev => {
                      const filtered = prev.filter(p => !deletedIds.has(p.projectId))
                      
                      // Immediately update cache AND displayProjectsRef
                      if (user && filtered.length >= 0) {
                        const cacheData = {
                          userId: user.id,
                          projects: filtered,
                          timestamp: Date.now()
                        }
                        localStorage.setItem('vibecanvas_all_projects_cache', JSON.stringify(cacheData))
                        // Also update displayProjectsRef immediately so it's in sync
                        displayProjectsRef.current = filtered
                      }
                      
                      return filtered
                    })
                    
                    // Clear selections immediately
                    setSelectedProjects(prev => {
                      const newSet = new Set(prev)
                      deletedIds.forEach(id => newSet.delete(id))
                      return newSet
                    })
                    
                    console.log('✅ UI updated immediately - projects removed from All Projects and added to Recently Deleted')
                    
                    // Update database in background (non-blocking, doesn't delay UI)
                    Promise.allSettled(
                      projects.map(project => 
                        softDeleteProject(project.projectId, user.id)
                          .then(() => console.log('✅ Soft deleted in database:', project.projectId))
                          .catch(error => {
                            console.error('❌ Error soft deleting in database:', project.projectId, error)
                            // Error doesn't affect UI - already updated optimistically
                          })
                      )
                    ).then(() => {
                      console.log('✅ All database updates completed')
                      // Resume refreshes after a brief delay to ensure DB has propagated
                      // This prevents loadAllProjects from running before DB is fully updated
                      setTimeout(() => {
                        pauseRefreshRef.current = false
                      }, 500) // Small delay to ensure DB propagation
                    })
                    
                    console.log('✅ Moved', projects.length, 'project(s) to Recently Deleted (instant UI update)')
                  } catch (error) {
                    console.error('❌ Error moving projects to Recently Deleted:', error)
                    alert(`Failed to delete project(s): ${error.message || 'Unknown error'}`)
                    pauseRefreshRef.current = false
                  }
                }}
              >
                Move to Recently Deleted
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default FileUploader
