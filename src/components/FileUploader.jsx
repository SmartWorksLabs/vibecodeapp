import { useRef, useState, useEffect, useMemo, Fragment } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { listProjects, loadProject, loadProjectById, deleteProject, softDeleteProject, restoreProject, renameProject } from '../services/projectService'
import AuthModal from './AuthModal'
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
          
          // Get list of permanently deleted project IDs from localStorage
          let permanentlyDeletedIds = new Set()
          try {
            const permanentlyDeletedStored = localStorage.getItem('vibecanvas_permanently_deleted_ids')
            if (permanentlyDeletedStored) {
              const permanentlyDeletedData = JSON.parse(permanentlyDeletedStored)
              if (Array.isArray(permanentlyDeletedData)) {
                permanentlyDeletedData.forEach(id => {
                  if (id) {
                    permanentlyDeletedIds.add(id)
                  }
                })
              }
            }
          } catch (e) {
            // Ignore errors reading permanently deleted projects
          }
          
          // Filter out deleted projects from cache
          // A project is deleted if:
          // 1. It has a deletedAt timestamp (valid ISO date string)
          // 2. Its projectId is in the recently deleted list
          // 3. Its projectId is in the permanently deleted list (CRITICAL - these should NEVER appear)
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
            
            // Check if project ID is permanently deleted (CRITICAL - these should NEVER appear)
            const isPermanentlyDeleted = project.projectId && permanentlyDeletedIds.has(project.projectId)
            
            // Project is active if it doesn't have a deleted timestamp AND is not in deleted list AND is not permanently deleted
            return !hasDeletedTimestamp && !isInDeletedList && !isPermanentlyDeleted
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
  const [editingProjectId, setEditingProjectId] = useState(null)
  const [editingProjectName, setEditingProjectName] = useState('')
  const editingInputRef = useRef(null)
  const folderInputRef = useRef(null)
  const fileInputRef = useRef(null)
  const openFilesButtonRef = useRef(null)
  
  // Delete confirmation modal state
  const [deleteModal, setDeleteModal] = useState({ show: false, project: null, isPermanent: false })
  const recentlyDeletedIdsRef = useRef(new Set())
  const permanentlyDeletedIdsRef = useRef(new Set())
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
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [fileTypeModal, setFileTypeModal] = useState({ 
    show: false, 
    files: [], 
    compatibleFiles: [], 
    incompatibleFiles: [], 
    excludedFiles: [], 
    totalSize: 0,
    fileCount: 0,
    limitViolations: null,
    onContinue: null, 
    onCancel: null 
  })
  
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
      
      // CRITICAL: Filter out permanently deleted projects - they should NEVER appear again
      // Even if they still exist in Supabase due to replication delay, we know they were deleted
      permanentlyDeletedIdsRef.current.forEach(permanentlyDeletedId => {
        deletedIds.add(permanentlyDeletedId)
      })
      
      const activeProjects = allFormatted.filter(project => !deletedIds.has(project.projectId))
      
      // Update recently deleted projects with current data from Supabase
      // Only show projects in Recently Deleted if they still exist in Supabase AND are still deleted
      // Important: Filter out projects that have been restored (deleted_at is null in database)
      // CRITICAL: Also filter out permanently deleted projects - they should NEVER appear in Recently Deleted
      const deletedProjectsWithData = currentDeletedProjects
        .filter(deleted => !permanentlyDeletedIdsRef.current.has(deleted.projectId)) // Remove permanently deleted
        .map(deleted => {
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
  
  // Handle project name editing
  const handleStartEditing = (projectId, currentName) => {
    setEditingProjectId(projectId)
    setEditingProjectName(currentName)
  }

  const handleCancelEditing = () => {
    setEditingProjectId(null)
    setEditingProjectName('')
  }

  const handleSaveProjectName = async (projectId, newName) => {
    if (!user) {
      alert('Please sign in to rename projects')
      handleCancelEditing()
      return
    }

    const trimmedName = newName.trim()
    if (!trimmedName) {
      alert('Project name cannot be empty')
      return
    }

    // Find the current project to get its current name
    const currentProject = displayProjects.find(p => p.projectId === projectId)
    if (!currentProject) {
      handleCancelEditing()
      return
    }

    if (trimmedName === currentProject.name) {
      // No change, just cancel editing
      handleCancelEditing()
      return
    }

    try {
      await renameProject(projectId, trimmedName, user.id)
      console.log('✅ Project renamed successfully:', projectId, 'to', trimmedName)
      
      // Reload projects to show the updated name
      await loadAllProjects()
      
      handleCancelEditing()
    } catch (error) {
      console.error('❌ Error renaming project:', error)
      alert(`Failed to rename project: ${error.message || 'Unknown error'}`)
    }
  }

  // Focus input when editing starts
  useEffect(() => {
    if (editingProjectId && editingInputRef.current) {
      editingInputRef.current.focus()
      editingInputRef.current.select()
    }
  }, [editingProjectId])

  // Handle Delete key press for selected projects
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't handle delete if user is editing a project name or typing in an input
      if (editingProjectId || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return
      }

      // Handle Delete or Backspace key
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedProjects.size > 0) {
        e.preventDefault()
        
        if (!user) {
          alert('Please sign in to delete projects')
          return
        }

        // Get selected projects
        const selectedArray = Array.from(selectedProjects)
        const selectedProjectsArray = displayProjects
          .filter(p => selectedArray.includes(p.projectId))
          .filter(Boolean)

        if (selectedProjectsArray.length === 0) {
          return
        }

        // Show delete confirmation modal
        if (selectedProjectsArray.length === 1) {
          setDeleteModal({ 
            show: true, 
            project: selectedProjectsArray[0], 
            isPermanent: activeTab === 'deleted',
            isBulk: false 
          })
        } else {
          setDeleteModal({ 
            show: true, 
            project: selectedProjectsArray[0], 
            isPermanent: activeTab === 'deleted',
            isBulk: true, 
            projects: selectedProjectsArray 
          })
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedProjects, user, activeTab, editingProjectId, displayProjects])

  // Permanently delete a project
  const handlePermanentDelete = async (projectId) => {
    if (!user) {
      alert('Please sign in to permanently delete projects')
      return
    }
    
    try {
      // Permanently delete from Supabase (removes from all tables)
      await deleteProject(projectId, user.id)
      console.log('✅ Project permanently deleted from Supabase:', projectId)
      
      // Remove from recently deleted state
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
      
      // Remove from recentlyDeletedIdsRef
      recentlyDeletedIdsRef.current.delete(projectId)
      
      // Add to permanently deleted ref - this project should NEVER appear again
      permanentlyDeletedIdsRef.current.add(projectId)
      
      // Save permanently deleted IDs to localStorage so they persist across refreshes
      try {
        const stored = localStorage.getItem('vibecanvas_permanently_deleted_ids')
        const deletedIds = stored ? JSON.parse(stored) : []
        if (!deletedIds.includes(projectId)) {
          deletedIds.push(projectId)
          localStorage.setItem('vibecanvas_permanently_deleted_ids', JSON.stringify(deletedIds))
        }
      } catch (e) {
        console.warn('Error saving permanently deleted IDs:', e)
      }
      
      // Remove from all projects cache if it exists there
      try {
        const cacheData = localStorage.getItem('vibecanvas_all_projects_cache')
        if (cacheData) {
          const parsed = JSON.parse(cacheData)
          if (parsed && parsed.projects) {
            const updatedProjects = parsed.projects.filter(p => p.projectId !== projectId)
            if (updatedProjects.length > 0) {
              localStorage.setItem('vibecanvas_all_projects_cache', JSON.stringify({
                ...parsed,
                projects: updatedProjects
              }))
            } else {
              localStorage.removeItem('vibecanvas_all_projects_cache')
            }
          }
        }
      } catch (e) {
        console.warn('Error updating all projects cache:', e)
      }
      
      // Update displayProjectsRef
      if (displayProjectsRef.current) {
        displayProjectsRef.current = displayProjectsRef.current.filter(p => p.projectId !== projectId)
      }
      
      // Remove from allProjects state if present
      setAllProjects(prev => prev.filter(p => p.projectId !== projectId))
      
      // Clear selection
      setSelectedProjects(prev => {
        const newSet = new Set(prev)
        newSet.delete(projectId)
        return newSet
      })
      
      // Reload projects from Supabase to ensure fresh data
      await loadAllProjects()
      
      console.log('✅ Project permanently deleted and all caches cleared:', projectId)
    } catch (error) {
      console.error('❌ Error permanently deleting project:', error)
      alert(`Failed to permanently delete project: ${error.message || 'Unknown error'}`)
    }
  }
  
  // Permanently delete multiple projects
  const handlePermanentDeleteSelected = async () => {
    if (!user) {
      alert('Please sign in to permanently delete projects')
      return
    }
    
    const selectedArray = Array.from(selectedProjects)
    if (selectedArray.length === 0) {
      return
    }
    
    try {
      // Permanently delete all selected projects from Supabase
      await Promise.all(selectedArray.map(id => deleteProject(id, user.id)))
      console.log('✅ Projects permanently deleted from Supabase:', selectedArray.length)
      
      // Remove from recently deleted state
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
      
      // Remove from recentlyDeletedIdsRef
      selectedArray.forEach(id => recentlyDeletedIdsRef.current.delete(id))
      
      // Add to permanently deleted ref - these projects should NEVER appear again
      selectedArray.forEach(id => permanentlyDeletedIdsRef.current.add(id))
      
      // Save permanently deleted IDs to localStorage so they persist across refreshes
      try {
        const stored = localStorage.getItem('vibecanvas_permanently_deleted_ids')
        const deletedIds = stored ? JSON.parse(stored) : []
        selectedArray.forEach(id => {
          if (!deletedIds.includes(id)) {
            deletedIds.push(id)
          }
        })
        localStorage.setItem('vibecanvas_permanently_deleted_ids', JSON.stringify(deletedIds))
      } catch (e) {
        console.warn('Error saving permanently deleted IDs:', e)
      }
      
      // Remove from all projects cache
      try {
        const cacheData = localStorage.getItem('vibecanvas_all_projects_cache')
        if (cacheData) {
          const parsed = JSON.parse(cacheData)
          if (parsed && parsed.projects) {
            const updatedProjects = parsed.projects.filter(p => !selectedProjects.has(p.projectId))
            if (updatedProjects.length > 0) {
              localStorage.setItem('vibecanvas_all_projects_cache', JSON.stringify({
                ...parsed,
                projects: updatedProjects
              }))
            } else {
              localStorage.removeItem('vibecanvas_all_projects_cache')
            }
          }
        }
      } catch (e) {
        console.warn('Error updating all projects cache:', e)
      }
      
      // Update displayProjectsRef
      if (displayProjectsRef.current) {
        displayProjectsRef.current = displayProjectsRef.current.filter(p => !selectedProjects.has(p.projectId))
      }
      
      // Remove from allProjects state
      setAllProjects(prev => prev.filter(p => !selectedProjects.has(p.projectId)))
      
      // Clear all selections
      setSelectedProjects(new Set())
      
      // Reload projects from Supabase to ensure fresh data
      await loadAllProjects()
      
      console.log('✅ Permanently deleted', selectedArray.length, 'project(s) and all caches cleared')
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

  const handleSignOut = async () => {
    await signOut()
  }

  // Helper function to check if file should be excluded
  const shouldExcludeFile = (filePath) => {
    const excludePatterns = [
      'node_modules',
      '.git',
      'dist',
      'build',
      '.next',
      '.vscode',
      '.idea',
      '__pycache__',
      '.DS_Store',
      'package-lock.json',
      'yarn.lock',
      'pnpm-lock.yaml'
    ]
    
    const path = filePath.toLowerCase()
    return excludePatterns.some(pattern => path.includes(pattern))
  }

  // Rule-based file handling constants (based on known working projects)
  const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB per file
  const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5MB per image
  const MAX_COMPATIBLE_FILES_WARNING = 100 // Warn at 100 files
  const MAX_COMPATIBLE_FILES_HARD_LIMIT = 200 // Hard limit at 200 files
  const MAX_TOTAL_SIZE_WARNING = 50 * 1024 * 1024 // 50MB total warning
  const MAX_TOTAL_SIZE_HARD_LIMIT = 100 * 1024 * 1024 // 100MB total hard limit
  const supportedExtensions = ['.html', '.css', '.js', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']

  // Helper function to detect file types and compatibility
  const detectFileTypes = (files) => {
    const compatibleFiles = []
    const incompatibleFiles = []
    const excludedFiles = []
    
    const maxFileSize = MAX_FILE_SIZE
    const maxImageSize = MAX_IMAGE_SIZE
    
    for (const file of files) {
      const fileName = file.name.toLowerCase()
      const filePath = file.webkitRelativePath || file.name
      const extension = fileName.includes('.') ? '.' + fileName.split('.').pop() : ''
      
      // Exclude files from common directories that shouldn't be loaded
      if (shouldExcludeFile(filePath)) {
        excludedFiles.push({
          name: file.name,
          size: file.size,
          type: extension ? extension.substring(1).toUpperCase() : 'UNKNOWN',
          reason: 'Excluded directory (node_modules, .git, etc.)'
        })
        continue
      }
      
      const isCompatible = supportedExtensions.includes(extension)
      const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(extension)
      const maxSize = isImage ? maxImageSize : maxFileSize
      const isTooLarge = file.size > maxSize
      
      const fileInfo = {
        name: file.name,
        size: file.size,
        type: extension ? extension.substring(1).toUpperCase() : 'UNKNOWN',
        isCompatible: isCompatible && !isTooLarge,
        isTooLarge,
        warning: isTooLarge ? (isImage ? 'Image too large (>5MB)' : 'File too large (>10MB)') : null
      }
      
      if (isCompatible && !isTooLarge) {
        compatibleFiles.push(fileInfo)
      } else if (isCompatible && isTooLarge) {
        incompatibleFiles.push({ ...fileInfo, reason: fileInfo.warning })
      } else {
        incompatibleFiles.push(fileInfo)
      }
    }
    
    // Calculate total size of compatible files
    const totalSize = compatibleFiles.reduce((sum, file) => sum + file.size, 0)
    const fileCount = compatibleFiles.length
    
    // Check for limit violations
    const limitViolations = {
      fileCountWarning: fileCount > MAX_COMPATIBLE_FILES_WARNING && fileCount <= MAX_COMPATIBLE_FILES_HARD_LIMIT,
      fileCountExceeded: fileCount > MAX_COMPATIBLE_FILES_HARD_LIMIT,
      totalSizeWarning: totalSize > MAX_TOTAL_SIZE_WARNING && totalSize <= MAX_TOTAL_SIZE_HARD_LIMIT,
      totalSizeExceeded: totalSize > MAX_TOTAL_SIZE_HARD_LIMIT,
      canProceed: fileCount <= MAX_COMPATIBLE_FILES_HARD_LIMIT && totalSize <= MAX_TOTAL_SIZE_HARD_LIMIT
    }
    
    return { 
      compatibleFiles, 
      incompatibleFiles, 
      excludedFiles,
      totalSize,
      fileCount,
      limitViolations
    }
  }

  const readFiles = async (files, isFolder = true, fromAllProjects = false) => {
    // First, detect file types (only show modal on first open, not from All Projects)
    if (!fromAllProjects) {
      const { compatibleFiles, incompatibleFiles, excludedFiles, totalSize, fileCount, limitViolations } = detectFileTypes(files)
      
      // Show modal if there are any files (compatible or incompatible)
      if (files.length > 0) {
        return new Promise((resolve) => {
          setFileTypeModal({
            show: true,
            files: files,
            compatibleFiles,
            incompatibleFiles,
            excludedFiles,
            totalSize,
            fileCount,
            limitViolations,
            onContinue: async () => {
              // Prevent continue if hard limits are exceeded
              if (!limitViolations.canProceed) {
                alert(`Cannot proceed: Project exceeds limits.\n\n` +
                      `File count: ${fileCount} (max: ${MAX_COMPATIBLE_FILES_HARD_LIMIT})\n` +
                      `Total size: ${(totalSize / 1024 / 1024).toFixed(1)}MB (max: ${MAX_TOTAL_SIZE_HARD_LIMIT / 1024 / 1024}MB)\n\n` +
                      `Please select a smaller subset of files.`)
                return
              }
              
              setFileTypeModal({ show: false, files: [], compatibleFiles: [], incompatibleFiles: [], excludedFiles: [], onContinue: null, onCancel: null, totalSize: 0, fileCount: 0, limitViolations: null })
              // Continue with only compatible files (excluding large files and excluded directories)
              const compatibleFileObjects = files.filter(file => {
                const fileName = file.name.toLowerCase()
                const filePath = file.webkitRelativePath || file.name
                // Exclude files from node_modules, .git, etc.
                if (shouldExcludeFile(filePath)) return false
                // Only include files that are in compatibleFiles list
                return compatibleFiles.some(cf => cf.name === file.name && !cf.isTooLarge)
              })
              await processFiles(compatibleFileObjects, isFolder)
              resolve()
            },
            onCancel: () => {
              setFileTypeModal({ show: false, files: [], compatibleFiles: [], incompatibleFiles: [], excludedFiles: [], onContinue: null, onCancel: null, totalSize: 0, fileCount: 0, limitViolations: null })
              resolve()
            }
          })
        })
      }
    }
    
    // If from All Projects, process directly without modal
    await processFiles(files, isFolder)
  }

  const processFiles = async (files, isFolder = true) => {
    const projectFiles = []
    
    console.log('FileUploader: Reading files', {
      totalFiles: files.length,
      fileNames: Array.from(files).map(f => f.name)
    })
    
    // Enforce rule-based limits
    let totalSize = 0
    let processedCount = 0
    
    for (const file of files) {
      // Skip excluded directories
      const filePath = file.webkitRelativePath || file.name
      if (shouldExcludeFile(filePath)) {
        console.log(`Skipping file from excluded directory: ${file.name}`)
        continue
      }
      
      // Check file count limit
      if (processedCount >= MAX_COMPATIBLE_FILES_HARD_LIMIT) {
        console.warn(`Reached file count limit (${MAX_COMPATIBLE_FILES_HARD_LIMIT}). Stopping processing.`)
        break
      }
      
      // Check file extension
      const fileName = file.name.toLowerCase()
      const extension = fileName.includes('.') ? '.' + fileName.split('.').pop() : ''
      const isCompatible = supportedExtensions.includes(extension)
      
      if (!isCompatible) {
        console.log(`Skipping file: ${file.name} (not supported file type)`)
        continue
      }
      
      // Check file size limits
      const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(extension)
      const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_FILE_SIZE
      
      if (file.size > maxSize) {
        console.log(`Skipping file: ${file.name} (too large: ${(file.size / 1024 / 1024).toFixed(1)}MB, max: ${maxSize / 1024 / 1024}MB)`)
        continue
      }
      
      // Check total size limit
      if (totalSize + file.size > MAX_TOTAL_SIZE_HARD_LIMIT) {
        console.warn(`Reached total size limit (${MAX_TOTAL_SIZE_HARD_LIMIT / 1024 / 1024}MB). Stopping processing.`)
        break
      }
      
      const isTextFile = extension === '.html' || extension === '.css' || extension === '.js'
      
      if (isTextFile || isImage) {
        try {
          let content;
          let dataUrl = null;
          
          if (isImage) {
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
            isImage: isImage,
            dataUrl: dataUrl
          })
          
          // Update counters
          totalSize += file.size
          processedCount++
          
          console.log(`Loaded file: ${file.name} (${isImage ? 'image' : content.length + ' chars'})`)
        } catch (error) {
          console.error(`Error reading file ${file.name}:`, error)
        }
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
    await readFiles(files, false, false) // false = not from All Projects
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
    await readFiles(files, true, false) // true = isFolder, false = not from All Projects
  }

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files)
    await readFiles(files, false, false) // false = isFolder (individual files), false = not from All Projects
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
                onClick={() => setShowAuthModal(true)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
                Sign In
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
                                  // Load project from user account (Supabase) by ID for reliability
                                  if (!project.projectId) {
                                    console.error('Project ID missing, cannot load project:', project)
                                    alert('Error: Project ID missing. Cannot load project.')
                                    return
                                  }
                                  const projectData = await loadProjectById(project.projectId, user.id)
                                  
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
                                  
                                  // Debug: Check CSS content when loading from Supabase
                                  const cssFile = files.find(f => f.name.endsWith('.css'))
                                  if (cssFile) {
                                    const savedColors = ['#004aeb', '#0854f7', '#004AEB', '#0854F7']
                                    const foundSavedColors = savedColors.filter(color => cssFile.content.includes(color))
                                    const sectionTitleColorRules = cssFile.content.match(/\.section-title[^{]*\{[^}]*color[^}]*\}/gi) || []
                                    const sectionTitleColorValues = sectionTitleColorRules.map(rule => {
                                      const colorMatch = rule.match(/color\s*:\s*([^;!]+)/i)
                                      return colorMatch ? colorMatch[1].trim() : null
                                    }).filter(Boolean)
                                    
                                    console.log('📥 Loading CSS from Supabase:', {
                                      fileName: cssFile.name,
                                      contentLength: cssFile.content.length,
                                      savedColorsFound: foundSavedColors.length > 0 ? `Contains ${foundSavedColors.join(', ')} ✓` : 'No saved colors found ✗',
                                      sectionTitleColorRules: sectionTitleColorRules.length,
                                      sectionTitleColorValues: sectionTitleColorValues,
                                      cssPreview: cssFile.content.includes('.section-title') 
                                        ? cssFile.content.substring(
                                            Math.max(0, cssFile.content.indexOf('.section-title') - 50),
                                            cssFile.content.indexOf('.section-title') + 500
                                          )
                                        : '.section-title not found'
                                    })
                                  }
                                  
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
                            {editingProjectId === project.projectId ? (
                              <input
                                ref={editingInputRef}
                                type="text"
                                value={editingProjectName}
                                onChange={(e) => setEditingProjectName(e.target.value)}
                                onBlur={() => handleSaveProjectName(project.projectId, editingProjectName)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.target.blur()
                                  } else if (e.key === 'Escape') {
                                    handleCancelEditing()
                                  }
                                }}
                                className="project-name-input"
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <>
                                <div className="project-name" title={project.name}>
                                  {project.name.length > 20 ? `${project.name.substring(0, 20)}...` : project.name}
                                </div>
                                <div className="project-meta">
                                  {project.fileCount} file{project.fileCount !== 1 ? 's' : ''}
                                </div>
                              </>
                            )}
                          </div>
                          {editingProjectId !== project.projectId && (
                            <div className="project-right-actions">
                              <button
                                className="project-name-edit-button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleStartEditing(project.projectId, project.name)
                                }}
                                title="Edit project name"
                                aria-label="Edit project name"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                              </button>
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
                            </div>
                          )}
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
                              {editingProjectId === project.projectId ? (
                                <input
                                  ref={editingInputRef}
                                  type="text"
                                  value={editingProjectName}
                                  onChange={(e) => setEditingProjectName(e.target.value)}
                                  onBlur={() => handleSaveProjectName(project.projectId, editingProjectName)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.target.blur()
                                    } else if (e.key === 'Escape') {
                                      handleCancelEditing()
                                    }
                                  }}
                                  className="project-name-input"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              ) : (
                                <>
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
                                </>
                              )}
                            </div>
                            {editingProjectId !== project.projectId && (
                              <div className="project-right-actions">
                                <button
                                  className="project-name-edit-button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleStartEditing(project.projectId, project.name)
                                  }}
                                  title="Edit project name"
                                  aria-label="Edit project name"
                                >
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                  </svg>
                                </button>
                                <input
                                  type="checkbox"
                                  className="project-checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    e.stopPropagation()
                                    handleToggleSelection(project.projectId)
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                  }}
                                />
                              </div>
                            )}
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

            {/* Auth Modal */}
            {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}

            {/* File Type Detection Modal */}
            {fileTypeModal.show && (
              <div className="file-type-modal-overlay" onClick={() => fileTypeModal.onCancel?.()}>
                <div className="file-type-modal" onClick={(e) => e.stopPropagation()}>
                  <div className="file-type-modal-header">
                    <h3>File Type Detection</h3>
                  </div>
                  <div className="file-type-modal-body">
                    <p>We detected the following files:</p>
                    
                    {fileTypeModal.excludedFiles.length > 0 && (
                      <div className="file-type-section">
                        <h4 className="file-type-excluded">
                          Excluded ({fileTypeModal.excludedFiles.length})
                        </h4>
                        <p className="file-type-info">
                          Files from node_modules, .git, dist, build, and other excluded directories are automatically excluded.
                        </p>
                        {fileTypeModal.excludedFiles.length <= 20 && (
                          <ul className="file-type-list excluded">
                            {fileTypeModal.excludedFiles.map((file, idx) => (
                              <li key={idx}>
                                <span className="file-name">{file.name}</span>
                                <span className="file-type-badge">{file.type}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {fileTypeModal.excludedFiles.length > 20 && (
                          <p className="file-type-info">
                            ({fileTypeModal.excludedFiles.length} files excluded - too many to list)
                          </p>
                        )}
                      </div>
                    )}
                    
                    {fileTypeModal.compatibleFiles.length > 0 && (
                      <div className="file-type-section">
                        <h4 className="file-type-compatible">
                          Compatible Files ({fileTypeModal.compatibleFiles.length})
                        </h4>
                        {fileTypeModal.limitViolations && (
                          <>
                            {fileTypeModal.limitViolations.fileCountExceeded && (
                              <p className="file-type-error">
                                Error: {fileTypeModal.fileCount} files exceeds the maximum limit of {MAX_COMPATIBLE_FILES_HARD_LIMIT} files. Cannot proceed.
                              </p>
                            )}
                            {fileTypeModal.limitViolations.fileCountWarning && !fileTypeModal.limitViolations.fileCountExceeded && (
                              <p className="file-type-warning">
                                Warning: {fileTypeModal.fileCount} files exceeds the recommended limit of {MAX_COMPATIBLE_FILES_WARNING} files. Performance may be affected.
                              </p>
                            )}
                            {fileTypeModal.limitViolations.totalSizeExceeded && (
                              <p className="file-type-error">
                                Error: Total size of {(fileTypeModal.totalSize / 1024 / 1024).toFixed(1)}MB exceeds the maximum limit of {MAX_TOTAL_SIZE_HARD_LIMIT / 1024 / 1024}MB. Cannot proceed.
                              </p>
                            )}
                            {fileTypeModal.limitViolations.totalSizeWarning && !fileTypeModal.limitViolations.totalSizeExceeded && (
                              <p className="file-type-warning">
                                Warning: Total size of {(fileTypeModal.totalSize / 1024 / 1024).toFixed(1)}MB exceeds the recommended limit of {MAX_TOTAL_SIZE_WARNING / 1024 / 1024}MB. Performance may be affected.
                              </p>
                            )}
                            {!fileTypeModal.limitViolations.fileCountWarning && !fileTypeModal.limitViolations.totalSizeWarning && fileTypeModal.fileCount > 50 && (
                              <p className="file-type-info">
                                Total size: {(fileTypeModal.totalSize / 1024 / 1024).toFixed(1)}MB
                              </p>
                            )}
                          </>
                        )}
                        <ul className="file-type-list compatible">
                          {fileTypeModal.compatibleFiles.slice(0, 50).map((file, idx) => (
                            <li key={idx}>
                              <span className="file-name">{file.name}</span>
                              <span className="file-type-badge">{file.type}</span>
                              <span className="file-size">({(file.size / 1024).toFixed(1)} KB)</span>
                            </li>
                          ))}
                          {fileTypeModal.compatibleFiles.length > 50 && (
                            <li className="file-type-more">
                              ... and {fileTypeModal.compatibleFiles.length - 50} more files
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                    
                    {fileTypeModal.incompatibleFiles.length > 0 && (
                      <div className="file-type-section">
                        <h4 className="file-type-incompatible">
                          Incompatible or Too Large ({fileTypeModal.incompatibleFiles.length})
                        </h4>
                        <ul className="file-type-list incompatible">
                          {fileTypeModal.incompatibleFiles.slice(0, 20).map((file, idx) => (
                            <li key={idx}>
                              <span className="file-name">{file.name}</span>
                              <span className="file-type-badge">{file.type}</span>
                              <span className="file-size">({(file.size / 1024).toFixed(1)} KB)</span>
                              {file.warning && <span className="file-warning-badge">{file.warning}</span>}
                            </li>
                          ))}
                          {fileTypeModal.incompatibleFiles.length > 20 && (
                            <li className="file-type-more">
                              ... and {fileTypeModal.incompatibleFiles.length - 20} more files
                            </li>
                          )}
                        </ul>
                        <p className="file-type-warning">
                          These files will be excluded if you choose to continue. Large files (&gt;5MB images, &gt;10MB others) are excluded for performance.
                        </p>
                      </div>
                    )}
                    
                    {fileTypeModal.compatibleFiles.length === 0 && (
                      <p className="file-type-error">
                        No compatible files found. Supported file types: HTML, CSS, JS, and images (JPG, PNG, GIF, WebP, SVG). Files larger than 5MB (images) or 10MB (others) are excluded.
                      </p>
                    )}
                    
                    {fileTypeModal.compatibleFiles.length > 0 && (
                      <div className="file-type-summary">
                        <p><strong>Summary:</strong></p>
                        <ul>
                          <li>Compatible files: {fileTypeModal.fileCount}</li>
                          <li>Total size: {(fileTypeModal.totalSize / 1024 / 1024).toFixed(1)}MB</li>
                          <li>Supported file types: HTML, CSS, JavaScript (.html, .css, .js) and images (JPG, PNG, GIF, WEBP, SVG)</li>
                          <li>Limits: Max {MAX_COMPATIBLE_FILES_HARD_LIMIT} files, Max {MAX_TOTAL_SIZE_HARD_LIMIT / 1024 / 1024}MB total</li>
                        </ul>
                      </div>
                    )}
                  </div>
                  <div className="file-type-modal-actions">
                    <button 
                      className="file-type-cancel"
                      onClick={() => fileTypeModal.onCancel?.()}
                    >
                      Cancel
                    </button>
                    {fileTypeModal.compatibleFiles.length > 0 && fileTypeModal.limitViolations?.canProceed !== false && (
                      <button 
                        className="file-type-continue"
                        onClick={() => fileTypeModal.onContinue?.()}
                      >
                        Continue with Compatible Files
                      </button>
                    )}
                    {fileTypeModal.compatibleFiles.length > 0 && fileTypeModal.limitViolations?.canProceed === false && (
                      <button 
                        className="file-type-continue"
                        disabled
                        title="Cannot proceed: Project exceeds hard limits"
                      >
                        Cannot Proceed (Exceeds Limits)
                      </button>
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
