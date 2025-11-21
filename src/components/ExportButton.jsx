import { useState } from 'react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import './ExportButton.css'

function ExportButton({ files }) {
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = async () => {
    setIsExporting(true)
    
    try {
      const zip = new JSZip()
      
      // Add all files to zip
      files.forEach(file => {
        zip.file(file.name, file.content)
      })
      
      // Generate zip file
      const blob = await zip.generateAsync({ type: 'blob' })
      
      // Download
      saveAs(blob, 'vibecanvas-project.zip')
      
      setIsExporting(false)
    } catch (error) {
      console.error('Export error:', error)
      setIsExporting(false)
      alert('Failed to export project. Please try again.')
    }
  }

  return (
    <button 
      className="export-button"
      onClick={handleExport}
      disabled={isExporting}
    >
      {isExporting ? 'Exporting...' : 'Export Project'}
    </button>
  )
}

export default ExportButton

