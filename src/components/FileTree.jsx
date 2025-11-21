import './FileTree.css'

function FileTree({ files, selectedFile, onFileSelect, isInspectorEnabled }) {
  const groupedFiles = {
    html: files.filter(f => f.type === 'html'),
    css: files.filter(f => f.type === 'css'),
    js: files.filter(f => f.type === 'js'),
    images: files.filter(f => ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(f.type))
  }

  const FileIcon = ({ type }) => {
    const iconSize = 14
    switch (type) {
      case 'html':
        return (
          <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round"/>
            <rect x="2" y="3" width="20" height="18" rx="2" strokeLinecap="round"/>
          </svg>
        )
      case 'css':
        return (
          <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )
      case 'js':
        return (
          <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 17l10 5 10-5M2 12l10 5 10-5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'webp':
      case 'svg':
        return (
          <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21,15 16,10 5,21"/>
          </svg>
        )
      default:
        return (
          <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
        )
    }
  }

  return (
    <div className="file-tree">
      <div className="file-tree-header">
        <h3>Project Files</h3>
      </div>
      <div className="file-tree-content">
        {groupedFiles.html.length > 0 && (
          <div className="file-group">
            <div className="file-group-title">HTML</div>
            {groupedFiles.html.map(file => (
              <div
                key={file.name}
                className={`file-item ${selectedFile?.name === file.name ? 'selected' : ''}`}
                onClick={() => onFileSelect(file)}
              >
                <span className="file-icon"><FileIcon type={file.type} /></span>
                <span className="file-name">{file.name}</span>
              </div>
            ))}
          </div>
        )}
        
        {groupedFiles.css.length > 0 && (
          <div className="file-group">
            <div className="file-group-title">CSS</div>
            {groupedFiles.css.map(file => (
              <div
                key={file.name}
                className={`file-item ${selectedFile?.name === file.name ? 'selected' : ''}`}
                onClick={() => onFileSelect(file)}
              >
                <span className="file-icon"><FileIcon type={file.type} /></span>
                <span className="file-name">{file.name}</span>
              </div>
            ))}
          </div>
        )}
        
        {groupedFiles.js.length > 0 && (
          <div className="file-group">
            <div className="file-group-title">JavaScript</div>
            {groupedFiles.js.map(file => (
              <div
                key={file.name}
                className={`file-item ${selectedFile?.name === file.name ? 'selected' : ''}`}
                onClick={() => onFileSelect(file)}
              >
                <span className="file-icon"><FileIcon type={file.type} /></span>
                <span className="file-name">{file.name}</span>
              </div>
            ))}
          </div>
        )}

        {groupedFiles.images.length > 0 && (
          <div className="file-group">
            <div className="file-group-title">Images</div>
            {groupedFiles.images.map(file => {
              const isClickable = isInspectorEnabled
              const handleClick = isClickable ? () => {
                console.log('Image clicked - inspector ON, selecting file:', file.name)
                onFileSelect(file)
              } : (e) => {
                console.log('Image clicked - inspector OFF, blocking action for:', file.name)
                e.preventDefault()
                e.stopPropagation()
                return false
              }
              
              return (
                <div
                  key={file.name}
                  className={`file-item ${selectedFile?.name === file.name ? 'selected' : ''} ${!isClickable ? 'file-item-non-clickable' : ''}`}
                  onClick={handleClick}
                  style={!isClickable ? { pointerEvents: 'none' } : {}}
                >
                  <span className="file-icon"><FileIcon type={file.type} /></span>
                  <span className="file-name">{file.name}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default FileTree

