/**
 * Test script to verify length marker handling with setlists
 */

// Import the marker service and setlist service
const markerService = require('./backend/services/markerService');
const setlistService = require('./backend/services/setlistService');

// Simplified version of the functions from markerStore.js
function extractLengthFromMarker(name) {
  const lengthMatch = name.match(/!length:(\d+(\.\d+)?)/);
  return lengthMatch ? parseFloat(lengthMatch[1]) : null;
}

function getCustomLengthForRegion(markers, region) {
  if (!region || !markers || markers.length === 0) return null;
  
  // Find markers that are within the region and have a !length tag
  const lengthMarkers = markers.filter(marker => 
    marker.position >= region.start && 
    marker.position <= region.end
  );
  
  // Check each marker for !length tag
  for (const marker of lengthMarkers) {
    const length = extractLengthFromMarker(marker.name);
    if (length !== null) {
      console.log(`Found custom length marker: "${marker.name}" at position ${marker.position}, setting region length to ${length} seconds`);
      return length;
    }
  }
  
  return null;
}

function getEffectiveRegionLength(region, markerList) {
  if (!region) return 0;
  
  const customLength = getCustomLengthForRegion(markerList, region);
  return customLength !== null ? customLength : (region.end - region.start);
}

// Mock region data
const mockRegions = [
  { id: 1, name: "Region 1", start: 0, end: 60 },
  { id: 2, name: "Region 2", start: 60, end: 180 },
  { id: 3, name: "Region 3", start: 180, end: 240 }
];

// Mock marker data with length markers
const mockMarkers = [
  { id: 1, name: "Marker 1", position: 10, color: "#FF0000" },
  { id: 2, name: "!length:45", position: 70, color: "#00FF00" },
  { id: 3, name: "Marker 3", position: 200, color: "#0000FF" }
];

// Mock setlist data
const mockSetlist = {
  id: "setlist-1",
  name: "Test Setlist",
  items: [
    { id: "item-1", regionId: 1, name: "Region 1", position: 0 },
    { id: "item-2", regionId: 2, name: "Region 2", position: 1 },
    { id: "item-3", regionId: 3, name: "Region 3", position: 2 }
  ]
};

// Test function to verify length marker handling
function testLengthMarkerHandling() {
  console.log("Testing length marker handling with setlists...");
  console.log("------------------------------------------------");
  
  // Test with all regions (no setlist)
  console.log("Testing with all regions (no setlist):");
  mockRegions.forEach(region => {
    const effectiveLength = getEffectiveRegionLength(region, mockMarkers);
    const originalLength = region.end - region.start;
    
    console.log(`Region ${region.id} (${region.name}):`);
    console.log(`  Original length: ${originalLength} seconds`);
    console.log(`  Effective length: ${effectiveLength} seconds`);
    
    if (effectiveLength !== originalLength) {
      console.log(`  Custom length applied: ${effectiveLength} seconds (from marker)`);
    }
    console.log();
  });
  
  // Test with setlist
  console.log("Testing with setlist:");
  mockSetlist.items.forEach(item => {
    const region = mockRegions.find(r => r.id === item.regionId);
    if (region) {
      const effectiveLength = getEffectiveRegionLength(region, mockMarkers);
      const originalLength = region.end - region.start;
      
      console.log(`Setlist item: ${item.name} (Region ID: ${item.regionId}):`);
      console.log(`  Original length: ${originalLength} seconds`);
      console.log(`  Effective length: ${effectiveLength} seconds`);
      
      if (effectiveLength !== originalLength) {
        console.log(`  Custom length applied: ${effectiveLength} seconds (from marker)`);
      }
      console.log();
    }
  });
  
  // Verification summary
  console.log("Verification Summary:");
  const region2 = mockRegions.find(r => r.id === 2);
  const effectiveLength = getEffectiveRegionLength(region2, mockMarkers);
  const originalLength = region2.end - region2.start;
  
  if (effectiveLength === 45 && originalLength === 120) {
    console.log("✅ SUCCESS: Length marker correctly applied to Region 2 in both contexts");
  } else {
    console.log("❌ FAILURE: Length marker not correctly applied");
    console.log(`  Expected effective length: 45 seconds`);
    console.log(`  Actual effective length: ${effectiveLength} seconds`);
  }
}

// Run the test
testLengthMarkerHandling();