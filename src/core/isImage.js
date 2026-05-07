module.exports = ({ ext }) => {
  const imageTypes = ['.jpg', '.jpeg', '.png', '.bmp', '.tif', '.tiff', '.webp', '.gif']
  return imageTypes.includes(ext)
}
