// Google Maps Geocoding API helper
// Usage: getGoogleAddress(lat, lon, apiKey)
async function getGoogleAddress(lat, lon, apiKey) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${apiKey}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('Google Maps API error');
  const data = await resp.json();
  if (data.status === 'OK' && data.results && data.results.length > 0) {
    // Prefer locality, then administrative_area_level_2, then formatted_address
    let locality = '', district = '', state = '', formatted = data.results[0].formatted_address;
    for (const comp of data.results[0].address_components) {
      if (comp.types.includes('locality')) locality = comp.long_name;
      if (comp.types.includes('administrative_area_level_2')) district = comp.long_name;
      if (comp.types.includes('administrative_area_level_1')) state = comp.long_name;
    }
    return { locality, district, state, formatted };
  }
  throw new Error('No address found');
}
window.getGoogleAddress = getGoogleAddress;
