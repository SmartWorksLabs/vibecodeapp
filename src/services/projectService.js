import { supabase } from '../lib/supabase'

/**
 * Save a project as a new project (always creates, never updates)
 */
export const saveProjectAsNew = async (projectName, files, userId) => {
  try {
    // Always create a new project (don't check for existing)
    const { data: newProject, error: projectError } = await supabase
      .from('projects')
      .insert({
        name: projectName,
        user_id: userId,
      })
      .select()
      .single()

    if (projectError) throw projectError
    const projectId = newProject.id

    // Insert all files for this new project
    const fileInserts = files.map((file) => ({
      project_id: projectId,
      file_name: file.name,
      file_content: file.content,
      file_type: file.type || file.name.split('.').pop(),
    }))

    const { error: filesError } = await supabase
      .from('project_files')
      .insert(fileInserts)

    if (filesError) {
      // If it's a conflict error, try deleting and re-inserting
      if (filesError.code === '23505' || filesError.message?.includes('duplicate') || filesError.message?.includes('409')) {
        console.log('Conflict detected, retrying file insert after delete...')
        await supabase
          .from('project_files')
          .delete()
          .eq('project_id', projectId)
        
        const { error: retryError } = await supabase
          .from('project_files')
          .insert(fileInserts)
        
        if (retryError) throw retryError
      } else {
        throw filesError
      }
    }

    return { success: true, projectId }
  } catch (error) {
    console.error('Error saving project as new:', error)
    throw error
  }
}

/**
 * Save or update a project in Supabase
 */
export const saveProject = async (projectName, files, userId) => {
  try {
    console.log('💾 saveProject: Looking for existing project:', projectName, 'user:', userId)
    
    // First, let's see what we're dealing with - get ALL projects with this name
    const { data: allMatches, error: debugError } = await supabase
      .from('projects')
      .select('id, name, deleted_at, updated_at')
      .eq('name', projectName)
      .eq('user_id', userId)
      .is('deleted_at', null) // Only check active (non-deleted) projects

    if (debugError) {
      console.error('❌ Error finding project:', debugError)
      throw debugError
    }

    console.log('🔍 All active projects with this name:', allMatches)
    console.log('🔍 Number of active matches:', allMatches?.length)

    // allMatches already contains only active projects (filtered at database level)
    const activeProjects = allMatches || []
    console.log('✅ Active (non-deleted) projects:', activeProjects)
    console.log('✅ Number of active projects:', activeProjects.length)

    let existingProject = null
    let projectId
    let wasUpdate = false

    if (activeProjects.length === 0) {
      // No active project exists - this is a new project
      console.log('📝 No existing project found, will CREATE new')
      existingProject = null
    } else if (activeProjects.length === 1) {
      // One active project found - update it
      existingProject = activeProjects[0]
      console.log('✅ Found existing project, will UPDATE:', existingProject.id)
    } else {
      // Multiple active projects found - this shouldn't happen, but handle it
      console.warn('⚠️ Found multiple active projects with same name!')
      console.warn('⚠️ Projects:', activeProjects)
      
      // Use the most recently updated one
      existingProject = activeProjects.sort((a, b) => 
        new Date(b.updated_at) - new Date(a.updated_at)
      )[0]
      
      console.log('✅ Using most recent project:', existingProject.id)
      
      // Delete the duplicates
      const duplicateIds = activeProjects.slice(1).map(p => p.id)
      console.log('🗑️ Deleting duplicate projects:', duplicateIds)
      
      await supabase
        .from('projects')
        .delete()
        .in('id', duplicateIds)
    }

    if (existingProject && existingProject.id) {
      // Update existing project
      projectId = existingProject.id
      wasUpdate = true
      // Try to update with deleted_at: null, but handle gracefully if column doesn't exist
      try {
        const { error: updateError } = await supabase
          .from('projects')
          .update({ 
            updated_at: new Date().toISOString(),
            deleted_at: null // Clear deleted_at to restore the project
          })
          .eq('id', projectId)
        if (updateError) throw updateError
      } catch (error) {
        // If deleted_at column doesn't exist, try without it
        if (error.message && error.message.includes('deleted_at')) {
          console.warn('⚠️ deleted_at column not found in database, updating without it')
          const { error: updateError } = await supabase
            .from('projects')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', projectId)
          if (updateError) throw updateError
        } else {
          throw error
        }
      }
    } else {
      // No existing project found - create new one
      console.log('⚠️ No existing project found, will CREATE new project:', projectName)
      const { data: newProject, error: projectError } = await supabase
        .from('projects')
        .insert({
          name: projectName,
          user_id: userId,
        })
        .select()
        .single()

      if (projectError) throw projectError
      projectId = newProject.id
      console.log('✅ Created new project:', projectId)
    }

    // Delete existing files for this project
    const { error: deleteError } = await supabase
      .from('project_files')
      .delete()
      .eq('project_id', projectId)

    if (deleteError) {
      console.warn('Warning: Error deleting existing files (non-fatal):', deleteError)
      // Continue anyway - we'll try to insert/update
    }

    // Insert/update all files
    const fileInserts = files.map((file) => ({
      project_id: projectId,
      file_name: file.name,
      file_content: file.content,
      file_type: file.type || file.name.split('.').pop(),
    }))

    const { error: filesError } = await supabase
      .from('project_files')
      .insert(fileInserts)

    if (filesError) {
      // If it's a conflict error, try deleting and re-inserting
      if (filesError.code === '23505' || filesError.message?.includes('duplicate') || filesError.message?.includes('409')) {
        console.log('Conflict detected, retrying file insert after delete...')
        // Delete again and retry
        await supabase
          .from('project_files')
          .delete()
          .eq('project_id', projectId)
        
        const { error: retryError } = await supabase
          .from('project_files')
          .insert(fileInserts)
        
        if (retryError) throw retryError
      } else {
        throw filesError
      }
    }

    console.log('✅ saveProject completed successfully. Project ID:', projectId, 'Action:', wasUpdate ? 'UPDATED' : 'CREATED')
    return { success: true, projectId }
  } catch (error) {
    console.error('❌ Error saving project:', error)
    throw error
  }
}

/**
 * Load a project from Supabase by ID
 */
export const loadProjectById = async (projectId, userId) => {
  try {
    // Find project by ID and verify it belongs to the user
    // Only load active (non-deleted) projects
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, name, created_at, updated_at')
      .eq('id', projectId)
      .eq('user_id', userId)
      .is('deleted_at', null) // Only load active projects
      .single()

    if (projectError || !project) {
      console.error('Project not found by ID:', projectId, 'Error:', projectError)
      throw new Error('Project not found')
    }

    // Load all files for this project
    const { data: files, error: filesError } = await supabase
      .from('project_files')
      .select('file_name, file_content, file_type')
      .eq('project_id', project.id)
      .order('file_name')

    if (filesError) throw filesError

    // Convert to the format expected by the app
    const formattedFiles = files.map((file) => ({
      name: file.file_name,
      content: file.file_content,
      type: file.file_type,
      lastModified: Date.now(), // We don't store this, so use current time
    }))

    return { project, files: formattedFiles }
  } catch (error) {
    console.error('Error loading project by ID:', error)
    throw error
  }
}

/**
 * Load a project from Supabase by name (for backwards compatibility)
 */
export const loadProject = async (projectName, userId) => {
  try {
    // Find project by name and user
    // Only load active (non-deleted) projects
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, name, created_at, updated_at')
      .eq('name', projectName)
      .eq('user_id', userId)
      .is('deleted_at', null) // Only load active projects
      .single()

    if (projectError || !project) {
      throw new Error('Project not found')
    }

    // Load all files for this project
    const { data: files, error: filesError } = await supabase
      .from('project_files')
      .select('file_name, file_content, file_type')
      .eq('project_id', project.id)
      .order('file_name')

    if (filesError) throw filesError

    // Convert to the format expected by the app
    const formattedFiles = files.map((file) => ({
      name: file.file_name,
      content: file.file_content,
      type: file.file_type,
      lastModified: Date.now(), // We don't store this, so use current time
    }))

    return { project, files: formattedFiles }
  } catch (error) {
    console.error('Error loading project:', error)
    throw error
  }
}

/**
 * List all projects for a user with file counts
 */
export const listProjects = async (userId) => {
  try {
    // Add cache busting to ensure we get fresh data
    // Try to include deleted_at if the column exists
    const { data: projects, error } = await supabase
      .from('projects')
      .select('id, name, created_at, updated_at, deleted_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })

    if (error) throw error
    
    // Filter out any null or invalid projects
    const validProjects = (projects || []).filter(p => p && p.id && p.name)

    // Get file count for each project
    const projectsWithFileCount = await Promise.all(
      validProjects.map(async (project) => {
        const { count, error: countError } = await supabase
          .from('project_files')
          .select('*', { count: 'exact', head: true })
          .eq('project_id', project.id)
        
        return {
          ...project,
          fileCount: countError ? 0 : (count || 0)
        }
      })
    )

    return projectsWithFileCount
  } catch (error) {
    console.error('Error listing projects:', error)
    throw error
  }
}

/**
 * Save text changes to Supabase
 */
export const saveTextChanges = async (projectId, fileName, elementSelector, oldText, newText, userId) => {
  try {
    const { error } = await supabase
      .from('text_changes')
      .insert({
        project_id: projectId,
        file_name: fileName,
        element_selector: elementSelector,
        old_text: oldText,
        new_text: newText,
        user_id: userId,
      })

    if (error) throw error

    return { success: true }
  } catch (error) {
    console.error('Error saving text changes:', error)
    throw error
  }
}

/**
 * Restore a project from Recently Deleted (clear deleted_at timestamp)
 * Note: This requires a deleted_at column in the projects table
 * If the column doesn't exist, this will fail gracefully
 */
export const restoreProject = async (projectId, userId) => {
  try {
    console.log('♻️ Restoring project:', projectId, 'user:', userId)
    const { data, error } = await supabase
      .from('projects')
      .update({ 
        deleted_at: null, // Clear deleted_at to restore the project
        updated_at: new Date().toISOString() 
      })
      .eq('id', projectId)
      .eq('user_id', userId)

    if (error) {
      // If deleted_at column doesn't exist, just log a warning and continue
      if (error.message && error.message.includes('deleted_at')) {
        console.warn('⚠️ deleted_at column not found in database. Restore will only work locally.')
        // Still update updated_at
        const { error: updateError } = await supabase
          .from('projects')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', projectId)
          .eq('user_id', userId)
        if (updateError) throw updateError
        console.log('✅ Project updated (restore column not available):', projectId)
        return { success: true }
      }
      throw error
    }
    console.log('✅ Project restored successfully:', projectId)
    return { success: true }
  } catch (error) {
    console.error('❌ Error restoring project:', error)
    throw error
  }
}

/**
 * Soft delete a project (set deleted_at timestamp)
 * Note: This requires a deleted_at column in the projects table
 * If the column doesn't exist, this will fail gracefully
 */
export const softDeleteProject = async (projectId, userId) => {
  try {
    console.log('🗑️ Soft deleting project:', projectId, 'user:', userId)
    const { data, error } = await supabase
      .from('projects')
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', projectId)
      .eq('user_id', userId)

    if (error) {
      // If deleted_at column doesn't exist, just log a warning and continue
      // The project will still be moved to Recently Deleted locally
      if (error.message && error.message.includes('deleted_at')) {
        console.warn('⚠️ deleted_at column not found in database. Soft delete will only work locally.')
        // Still update updated_at
        const { error: updateError } = await supabase
          .from('projects')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', projectId)
          .eq('user_id', userId)
        if (updateError) throw updateError
        console.log('✅ Project updated (soft delete column not available):', projectId)
        return { success: true }
      }
      throw error
    }
    console.log('✅ Project soft deleted successfully:', projectId)
    return { success: true }
  } catch (error) {
    console.error('❌ Error soft deleting project:', error)
    throw error
  }
}

/**
 * Delete a project from Supabase
 * Deletes from ALL tables: project_files, text_changes, and projects
 */
export const deleteProject = async (projectId, userId) => {
  try {
    console.log('🗑️ Starting delete process for project:', projectId, 'user:', userId)
    
    // Verify the project belongs to the user
    const { data: project, error: verifyError } = await supabase
      .from('projects')
      .select('id, user_id, name')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single()

    if (verifyError || !project) {
      console.error('❌ Project verification failed:', verifyError)
      throw new Error('Project not found or access denied')
    }

    console.log('✅ Project verified:', project.name)

    // Step 1: Delete all files for this project
    console.log('Deleting project_files...')
    const { error: filesError, count: filesDeleted } = await supabase
      .from('project_files')
      .delete()
      .eq('project_id', projectId)
      .select()

    if (filesError) {
      console.error('❌ Error deleting project_files:', filesError)
      throw filesError
    }
    console.log('✅ Deleted project_files')

    // Step 2: Delete text changes for this project
    console.log('Deleting text_changes...')
    const { error: textChangesError } = await supabase
      .from('text_changes')
      .delete()
      .eq('project_id', projectId)

    if (textChangesError) {
      console.warn('⚠️ Warning: Error deleting text_changes (non-fatal):', textChangesError)
      // Continue even if text changes deletion fails
    } else {
      console.log('✅ Deleted text_changes')
    }

    // Step 3: Delete the project itself
    console.log('Deleting project record...')
    const { error: projectError } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId)

    if (projectError) {
      console.error('❌ Error deleting project:', projectError)
      throw projectError
    }
    console.log('✅ Deleted project record')

    // Step 4: Verify deletion (with retry for eventual consistency)
    // Note: Supabase may have replication delay, so we retry a few times
    console.log('Verifying deletion...')
    let verified = false
    let attempts = 0
    const maxAttempts = 3
    
    while (!verified && attempts < maxAttempts) {
      attempts++
      const { data: verifyDeleted, error: verifyDeleteError } = await supabase
        .from('projects')
        .select('id')
        .eq('id', projectId)
        .maybeSingle()

      if (verifyDeleteError) {
        console.warn(`⚠️ Verification attempt ${attempts} failed (non-fatal):`, verifyDeleteError)
        // Wait before retry
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      } else if (verifyDeleted) {
        console.warn(`⚠️ Project still exists after deletion (attempt ${attempts}/${maxAttempts})`)
        // Wait before retry
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      } else {
        verified = true
        console.log('✅ Deletion verified - project no longer exists')
      }
    }
    
    if (!verified) {
      console.warn('⚠️ Could not verify deletion after', maxAttempts, 'attempts, but delete operations completed successfully')
      console.warn('⚠️ This may be due to Supabase replication delay. The project should be deleted.')
    }

    console.log('✅ Successfully deleted project from ALL tables:', projectId, project.name)
    return { success: true }
  } catch (error) {
    console.error('❌ Error deleting project:', error)
    throw error
  }
}

/**
 * Rename a project
 */
export const renameProject = async (projectId, newName, userId) => {
  try {
    console.log('✏️ Renaming project:', projectId, 'to:', newName, 'user:', userId)
    
    // Verify the project belongs to the user
    const { data: project, error: verifyError } = await supabase
      .from('projects')
      .select('id, user_id, name')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single()

    if (verifyError || !project) {
      console.error('❌ Project verification failed:', verifyError)
      throw new Error('Project not found or access denied')
    }

    // Check if new name already exists (excluding the current project)
    const { data: existingProject, error: checkError } = await supabase
      .from('projects')
      .select('id')
      .eq('name', newName)
      .eq('user_id', userId)
      .neq('id', projectId)
      .is('deleted_at', null) // Only check active projects
      .maybeSingle()

    if (checkError) {
      console.error('❌ Error checking for duplicate name:', checkError)
      throw checkError
    }

    if (existingProject) {
      throw new Error('A project with this name already exists')
    }

    // Update the project name
    const { error: updateError } = await supabase
      .from('projects')
      .update({ 
        name: newName,
        updated_at: new Date().toISOString() 
      })
      .eq('id', projectId)
      .eq('user_id', userId)

    if (updateError) {
      console.error('❌ Error renaming project:', updateError)
      throw updateError
    }

    console.log('✅ Project renamed successfully:', projectId, 'from', project.name, 'to', newName)
    return { success: true }
  } catch (error) {
    console.error('❌ Error renaming project:', error)
    throw error
  }
}

