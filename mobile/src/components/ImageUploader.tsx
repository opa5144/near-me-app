import React, { useState, useEffect, useRef } from 'react';

export default function ImageUploader() {
  const [selectedImage, setSelectedImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const fileInputRef = useRef(null);

  // 1. Memory Cleanup: Revoke blob URL when preview changes or component unmounts
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Handle the file selection event
  const handleImageChange = (event) => {
    const file = event.target.files[0];

    if (file && file.type.startsWith('image/')) {
      setSelectedImage(file);

      // Create object URL (will be cleaned up automatically by useEffect)
      const fileUrl = URL.createObjectURL(file);
      setPreviewUrl(fileUrl);
    } else if (file) {
      alert('Please select a valid image file.');
      handleReset();
    }
  };

  // 2. Reset input DOM ref so re-selecting the exact same file works properly
  const handleReset = () => {
    setSelectedImage(null);
    setPreviewUrl('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUpload = async () => {
    if (!selectedImage) return;

    const formData = new FormData();
    formData.append('image', selectedImage);

    try {
      console.log('Ready to upload:', selectedImage.name);
      // Example POST request:
      // await fetch('/api/upload', { method: 'POST', body: formData });
      
      alert('Upload successful!');
      handleReset(); // Reset after successful upload
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Upload failed.');
    }
  };

  return (
    <div style={{ border: '1px solid #ccc', padding: '20px', borderRadius: '8px', maxWidth: '400px' }}>
      <h3>Upload an Image</h3>

      <input> 
  </input>
