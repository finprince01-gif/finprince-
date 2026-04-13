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
    with connection.cursor() as cursor:
        cursor.execute("SELECT DISTINCT `Type of Business` FROM master_hierarchy_raw WHERE `Type of Business` IS NOT NULL AND `Type of Business` != '' AND `Type of Business` != '-'")
        rows = cursor.fetchall()
    return sorted([row[0] for row in rows if row[0]])


def get_flat_hierarchy_rows(business_type=None):
    """
    Returns flat rows from master_hierarchy_raw in the format the frontend
    LedgerCreationWizard and HierarchicalDropdown expect.

    Each row is a dict with keys:
        id, type_of_business_1, financial_reporting_1, major_group_1,
        group_1, sub_group_1_1, sub_group_2_1, sub_group_3_1, ledger_1, code

    This intentionally matches the HierarchyRow interface in the frontend
    TypeScript components.

    NOTE: master_hierarchy_raw has no primary key column. We generate a
    sequential row_num as the id.
    """
    logger.info(f"Fetching flat hierarchy rows (filter: {business_type})...")

    query = """
        SELECT
            `Type of Business`,
            `Financial Reporting`,
            `Major Group`,
            `Group`,
            `Sub-group 1`,
            `Sub-group 2`,
            `Sub-group 3`,
            `Ledgers`,
            `Code`
        FROM master_hierarchy_raw
    """
    params = []
    if business_type:
        query += " WHERE `Type of Business` = %s"
        params.append(business_type)
        
    query += " ORDER BY `Major Group`, `Group`, `Sub-group 1`, `Sub-group 2`, `Sub-group 3`, `Ledgers`"

    with connection.cursor() as cursor:
        cursor.execute(query, params)
        rows = cursor.fetchall()

    logger.info(f"Fetched {len(rows)} flat rows from master_hierarchy_raw.")

    result = []
    for idx, row in enumerate(rows, start=1):
        result.append({
            "id": idx,                          # Generated sequential ID (no PK in DB)
            "type_of_business_1": _clean_val(row[0]),
            "financial_reporting_1": _clean_val(row[1]),
            "major_group_1": _clean_val(row[2]),
            "group_1": _clean_val(row[3]),
            "sub_group_1_1": _clean_val(row[4]),
            "sub_group_2_1": _clean_val(row[5]),
            "sub_group_3_1": _clean_val(row[6]),
            "ledger_1": _clean_val(row[7]),
            "code": _clean_val(row[8]),
        })

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
        cursor.execute("""
            SELECT
                `Type of Business`,
                `Financial Reporting`,
                `Major Group`,
                `Group`,
                `Sub-group 1`,
                `Sub-group 2`,
                `Sub-group 3`,
                `Ledgers`
            FROM master_hierarchy_raw
        """)
        rows = cursor.fetchall()

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
