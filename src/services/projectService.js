import { supabase } from '../lib/supabase'

/**
 * Save or update a project in Supabase
 */
export const saveProject = async (projectName, files, userId) => {
  try {
    // Find existing project by name and user
    const { data: existingProjects, error: findError } = await supabase
      .from('projects')
      .select('id')
      .eq('name', projectName)
      .eq('user_id', userId)
      .maybeSingle()

    let projectId

    if (existingProjects && existingProjects.id) {
      // Update existing project
      projectId = existingProjects.id
      const { error: updateError } = await supabase
        .from('projects')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', projectId)
      if (updateError) throw updateError
    } else {
      // Create new project
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
    }

    // Delete existing files for this project
    await supabase
      .from('project_files')
      .delete()
      .eq('project_id', projectId)

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

    if (filesError) throw filesError

    return { success: true, projectId }
  } catch (error) {
    console.error('Error saving project:', error)
    throw error
  }
}

/**
 * Load a project from Supabase
 */
export const loadProject = async (projectName, userId) => {
  try {
    // Find project by name and user
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, name, created_at, updated_at')
      .eq('name', projectName)
      .eq('user_id', userId)
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
 * List all projects for a user
 */
export const listProjects = async (userId) => {
  try {
    const { data: projects, error } = await supabase
      .from('projects')
      .select('id, name, created_at, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })

    if (error) throw error

    return projects
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

