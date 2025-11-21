import './GridOverlay.css'

function GridOverlay({ gridType, isVisible, gridColor = 'blue' }) {
  if (!isVisible || gridType === 'none') {
    return null
  }

  const getGridConfig = (type) => {
    switch (type) {
      case 'small':
        return { size: 8, className: 'grid-small' }
      case 'medium':
        return { size: 16, className: 'grid-medium' }
      case 'large':
        return { size: 24, className: 'grid-large' }
      case 'flexible':
        return { size: 12, className: 'grid-flexible' }
      default:
        return { size: 16, className: 'grid-medium' }
    }
  }

  const getGridColors = (color) => {
    switch (color) {
      case 'blue':
        return { minor: 'rgba(74, 158, 255, 0.3)', major: 'rgba(74, 158, 255, 0.5)' }
      case 'white':
        return { minor: 'rgba(255, 255, 255, 0.4)', major: 'rgba(255, 255, 255, 0.6)' }
      case 'red':
        return { minor: 'rgba(255, 107, 107, 0.3)', major: 'rgba(255, 107, 107, 0.5)' }
      case 'green':
        return { minor: 'rgba(81, 207, 102, 0.3)', major: 'rgba(81, 207, 102, 0.5)' }
      case 'purple':
        return { minor: 'rgba(156, 107, 255, 0.3)', major: 'rgba(156, 107, 255, 0.5)' }
      case 'orange':
        return { minor: 'rgba(255, 146, 43, 0.3)', major: 'rgba(255, 146, 43, 0.5)' }
      default:
        return { minor: 'rgba(74, 158, 255, 0.3)', major: 'rgba(74, 158, 255, 0.5)' }
    }
  }

  const config = getGridConfig(gridType)
  const colors = getGridColors(gridColor)

  return (
    <div className={`grid-overlay ${config.className}`}>
      <svg className="grid-svg" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern
            id={`grid-${gridType}-${gridColor}`}
            width={config.size}
            height={config.size}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${config.size} 0 L 0 0 0 ${config.size}`}
              fill="none"
              stroke={colors.minor}
              strokeWidth="0.5"
            />
          </pattern>
          <pattern
            id={`grid-major-${gridType}-${gridColor}`}
            width={config.size * 5}
            height={config.size * 5}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${config.size * 5} 0 L 0 0 0 ${config.size * 5}`}
              fill="none"
              stroke={colors.major}
              strokeWidth="1"
            />
          </pattern>
        </defs>
        
        {/* Minor grid lines */}
        <rect
          width="100%"
          height="100%"
          fill={`url(#grid-${gridType}-${gridColor})`}
        />
        
        {/* Major grid lines every 5th line */}
        <rect
          width="100%"
          height="100%"
          fill={`url(#grid-major-${gridType}-${gridColor})`}
        />
      </svg>
    </div>
  )
}

export default GridOverlay
