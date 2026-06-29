import logging
from django.db import connection

logger = logging.getLogger(__name__)

# Static cache for the hierarchy tree (internal use only)
_HIERARCHY_CACHE = None


def _clean_val(val):
    """Normalize a DB value: blank/dash/null → None."""
    if val is None:
        return None
    cleaned = str(val).strip()
    if cleaned == '-' or cleaned == '' or cleaned.lower() == 'null':
        return None
    return cleaned


def get_business_types():
    """Returns a unique list of business types from the hierarchy."""
    from .models import MasterHierarchyRaw
    types = MasterHierarchyRaw.objects.exclude(type_of_business_1__isnull=True).exclude(type_of_business_1__exact='').exclude(type_of_business_1__exact='-').values_list('type_of_business_1', flat=True).distinct()
    return sorted([t for t in types if t])


def get_flat_hierarchy_rows(business_type=None):
    """
    Returns flat rows from master_hierarchy_raw in the format the frontend
    LedgerCreationWizard and HierarchicalDropdown expect.
    """
    logger.info(f"Fetching flat hierarchy rows (filter: {business_type})...")
    from .models import MasterHierarchyRaw

    qs = MasterHierarchyRaw.objects.all().order_by('id')
    if business_type:
        qs = qs.filter(type_of_business_1=business_type)

    rows = list(qs.values(
        'id', 'type_of_business_1', 'financial_reporting_1', 'major_group_1',
        'group_1', 'sub_group_1_1', 'sub_group_2_1', 'sub_group_3_1', 'ledger_1', 'code'
    ))

    result = []
    for row in rows:
        result.append({
            "id": row['id'],
            "type_of_business_1": _clean_val(row['type_of_business_1']),
            "financial_reporting_1": _clean_val(row['financial_reporting_1']),
            "major_group_1": _clean_val(row['major_group_1']),
            "group_1": _clean_val(row['group_1']),
            "sub_group_1_1": _clean_val(row['sub_group_1_1']),
            "sub_group_2_1": _clean_val(row['sub_group_2_1']),
            "sub_group_3_1": _clean_val(row['sub_group_3_1']),
            "ledger_1": _clean_val(row['ledger_1']),
            "code": _clean_val(row['code']),
        })

    logger.info(f"Fetched {len(result)} flat rows from master_hierarchy_raw.")
    return result


def build_ledger_hierarchy_tree(force_refresh=False):
    """
    Builds a hierarchical tree from master_hierarchy_raw for internal/admin use.
    Order: Type of Business -> Financial Reporting -> Major Group -> Group -> Sub-groups -> Ledger

    Returns a list of nested dicts: [{ "name": "...", "children": [...] }]

    NOTE: The frontend NO LONGER uses this tree format directly.
          The frontend fetches flat rows via get_flat_hierarchy_rows() and
          builds its own tree client-side in LedgerCreationWizard.tsx.
    """
    global _HIERARCHY_CACHE

    if _HIERARCHY_CACHE and not force_refresh:
        logger.debug("Returning cached hierarchy tree")
        return _HIERARCHY_CACHE

    logger.info("Building full ledger hierarchy tree from master_hierarchy_raw...")

    with connection.cursor() as cursor:
        from .models import MasterHierarchyRaw
        qs = MasterHierarchyRaw.objects.all().values_list(
            'type_of_business_1',
            'financial_reporting_1',
            'major_group_1',
            'group_1',
            'sub_group_1_1',
            'sub_group_2_1',
            'sub_group_3_1',
            'ledger_1'
        )
        rows = list(qs)

    logger.info(f"Fetched {len(rows)} raw rows for full hierarchy.")

    # Step 1: Build nested dicts
    root_nodes = {}
    node_count = 0

    for row in rows:
        # indices: 0=TypeOfBusiness, 1=FinRep, 2=MajorGroup, 3=Group,
        #          4=SG1, 5=SG2, 6=SG3, 7=Ledger
        levels = []
        for i in range(7):
            v = _clean_val(row[i])
            if v:
                levels.append(v)

        ledger_name = _clean_val(row[7])

        current_level = root_nodes
        for level_name in levels:
            if level_name not in current_level:
                current_level[level_name] = {
                    "name": level_name,
                    "children": {}
                }
                node_count += 1
            current_level = current_level[level_name]["children"]

        if ledger_name:
            if ledger_name not in current_level:
                current_level[ledger_name] = {
                    "name": ledger_name,
                    "type": "ledger"
                }
                node_count += 1

    def transform(nodes_dict):
        result = []
        for key in sorted(nodes_dict.keys()):
            node_data = nodes_dict[key]
            node = {"name": node_data["name"]}

            if "type" in node_data:
                node["type"] = node_data["type"]

            if "children" in node_data:
                children_list = transform(node_data["children"])
                if children_list:
                    node["children"] = children_list

            result.append(node)
        return result

    final_tree = transform(root_nodes)
    _HIERARCHY_CACHE = final_tree

    logger.info(f"Full hierarchy built with {node_count} nodes. Roots: {len(final_tree)}")
    return final_tree
