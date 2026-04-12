from core.exceptions import BranchAccessDenied

def nested_multipart_to_nested_dict(query_dict):
    """
    Helper to expand flattend keys from FormData into a nested dictionary.
    Handles 'obj.prop' and 'arr[0].prop' style keys.
    """
    import re
    result = {}
    
    for key in query_dict:
        # Get value - if it's a list (like from a QueryDict), take the first one
        # Unless it's truly a list of files or something, but here we expect unique keys
        value = query_dict[key]
        if hasattr(query_dict, 'getlist'):
             # If there's only one item, don't return as list unless it's an array key?
             # Actually, DRF-nested multipart usually has unique keys per item.
             pass

        parts = re.split(r'\.|(?=\[)', key)
        # parts might be ['items', '[0]', '.item_code'] if we used a different split
        # Let's use a simpler approach:
        
        # Split by '.' first
        top_parts = key.split('.')
        current = result
        
        for i, part in enumerate(top_parts):
            # Check for array notation in part: 'name[index]'
            if '[' in part and ']' in part:
                 name = part[:part.find('[')]
                 # Multiple indexes could exist like 'arr[0][1]' but we probably only have one
                 indexes = re.findall(r'\[(\d+)\]', part)
                 
                 # Navigate into 'name'
                 if name:
                     if name not in current or not isinstance(current[name], list):
                         current[name] = []
                     current = current[name]
                 
                 # Navigate through indexes
                 for j, idx_str in enumerate(indexes):
                     idx = int(idx_str)
                     while len(current) <= idx:
                         current.append({})
                     
                     if j < len(indexes) - 1 or i < len(top_parts) - 1:
                         # More to go
                         if not isinstance(current[idx], (dict, list)):
                             current[idx] = {}
                         current = current[idx]
                     else:
                         # Last part
                         current[idx] = value
            else:
                # Normal property
                if i < len(top_parts) - 1:
                    if part not in current or not isinstance(current[part], dict):
                        current[part] = {}
                    current = current[part]
                else:
                    current[part] = value
                    
    return result
