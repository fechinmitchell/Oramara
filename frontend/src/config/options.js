// oramara/frontend/src/config/options.js
// Keep in sync with oramara/backend/src/services/constants.js

export const LEAD_TYPES = [
    { value: 'gaa', label: 'GAA club' },
    { value: 'soccer', label: 'Soccer club' },
    { value: 'rugby', label: 'Rugby club' },
    { value: 'golf', label: 'Golf course' },
    { value: 'council', label: 'Council' },
    { value: 'school', label: 'School' },
    { value: 'farm', label: 'Farm' },
    { value: 'other', label: 'Other' }
  ];
  
  export const LEAD_STATUSES = [
    { value: 'new', label: 'New' },
    { value: 'contacted', label: 'Contacted' },
    { value: 'meeting', label: 'Meeting booked' },
    { value: 'trial', label: 'On trial' },
    { value: 'customer', label: 'Customer' },
    { value: 'lost', label: 'Lost' }
  ];
  
  export const PITCH_TYPES = [
    { value: 'gaa', label: 'GAA pitch' },
    { value: 'soccer', label: 'Soccer pitch' },
    { value: 'rugby', label: 'Rugby pitch' },
    { value: 'golf', label: 'Golf greens' }
  ];
  
  export const COUNTIES = [
    'Antrim', 'Armagh', 'Carlow', 'Cavan', 'Clare', 'Cork', 'Derry', 'Donegal', 'Down', 'Dublin',
    'Fermanagh', 'Galway', 'Kerry', 'Kildare', 'Kilkenny', 'Laois', 'Leitrim', 'Limerick', 'Longford',
    'Louth', 'Mayo', 'Meath', 'Monaghan', 'Offaly', 'Roscommon', 'Sligo', 'Tipperary', 'Tyrone',
    'Waterford', 'Westmeath', 'Wexford', 'Wicklow'
  ];
  
  export const labelFor = (list, value) => list.find((o) => o.value === value)?.label || value;