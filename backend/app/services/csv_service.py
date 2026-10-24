import csv
import io
import re
from typing import Optional, Tuple, Set, Dict, List, Any
from app.models.enums import UserRole
from app.schemas.employee import EmployeeImportPreviewRow

# Security limits
MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB
MAX_ROW_COUNT = 1000

# Canonical fields required or supported
CANONICAL_FIELDS = ["name", "email", "role", "position", "department"]

# Recognized header alias mappings (case-insensitive, normalized)
HEADER_ALIASES: Dict[str, Set[str]] = {
    "name": {
        "name",
        "full name",
        "fullname",
        "employee name",
        "employeename",
        "staff name",
        "member name",
        "display name",
        "user name",
        "username",
    },
    "email": {
        "email",
        "email address",
        "emailaddress",
        "work email",
        "workemail",
        "corporate email",
        "corporateemail",
        "business email",
        "user email",
    },
    "role": {
        "role",
        "user role",
        "userrole",
        "employee role",
        "employeerole",
        "access level",
        "accesslevel",
        "permission",
        "authorization",
        "account role",
    },
    "position": {
        "position",
        "job position",
        "jobposition",
        "designation",
        "job title",
        "jobtitle",
        "title",
        "role title",
        "occupation",
    },
    "department": {
        "department",
        "dept",
        "team",
        "division",
        "business unit",
        "businessunit",
        "unit",
        "group",
    },
}

# Role synonym mapping to valid UserRole enums
ROLE_SYNONYMS: Dict[str, UserRole] = {
    "employee": UserRole.EMPLOYEE,
    "emp": UserRole.EMPLOYEE,
    "user": UserRole.EMPLOYEE,
    "member": UserRole.EMPLOYEE,
    "staff": UserRole.EMPLOYEE,
    "developer": UserRole.EMPLOYEE,
    "engineer": UserRole.EMPLOYEE,
    "team lead": UserRole.TEAM_LEAD,
    "team_lead": UserRole.TEAM_LEAD,
    "teamlead": UserRole.TEAM_LEAD,
    "lead": UserRole.TEAM_LEAD,
    "manager": UserRole.TEAM_LEAD,
    "lead engineer": UserRole.TEAM_LEAD,
    "admin": UserRole.ADMIN,
    "administrator": UserRole.ADMIN,
}

EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")


class CsvService:
    """
    Deterministic Python-based CSV cleaning and validation engine.
    Ensures safe parsing, alias normalization, error tracing, and data integrity.
    """

    @staticmethod
    def normalize_header_string(header: str) -> str:
        """Standardizes a header string for alias matching."""
        cleaned = re.sub(r"[\s_\-]+", " ", header.strip().lower())
        return cleaned

    @classmethod
    def detect_and_map_headers(
        cls,
        raw_headers: List[str],
        manual_mapping: Optional[Dict[str, str]] = None,
    ) -> Tuple[Dict[str, str], bool]:
        """
        Maps canonical fields ('name', 'email', 'role', 'position', 'department')
        to the exact headers present in the uploaded CSV.
        Returns (mapping_dict: {canonical: uploaded_header}, mapping_required: bool).
        """
        mapping: Dict[str, str] = {}
        used_headers: Set[str] = set()

        # 1. Apply any manual overrides specified by the administrator
        if manual_mapping:
            for canonical, uploaded in manual_mapping.items():
                if canonical in CANONICAL_FIELDS and uploaded in raw_headers:
                    mapping[canonical] = uploaded
                    used_headers.add(uploaded)

        # 2. Automatically resolve remaining unmapped canonical fields
        for canonical in CANONICAL_FIELDS:
            if canonical in mapping:
                continue

            aliases = HEADER_ALIASES.get(canonical, set())

            # First pass: exact normalized match
            for raw_h in raw_headers:
                if raw_h in used_headers:
                    continue
                norm = cls.normalize_header_string(raw_h)
                if norm in aliases:
                    mapping[canonical] = raw_h
                    used_headers.add(raw_h)
                    break

            # Second pass: substring match if not yet resolved
            if canonical not in mapping:
                for raw_h in raw_headers:
                    if raw_h in used_headers:
                        continue
                    norm = cls.normalize_header_string(raw_h)
                    if any(alias in norm for alias in aliases):
                        mapping[canonical] = raw_h
                        used_headers.add(raw_h)
                        break

        # A valid import fundamentally requires 'name' and 'email' mappings
        mapping_required = not bool(mapping.get("name") and mapping.get("email"))
        return mapping, mapping_required

    @classmethod
    def parse_csv_bytes(cls, file_bytes: bytes) -> Tuple[List[str], List[Dict[str, Any]], List[str]]:
        """
        Safely reads raw CSV bytes, decodes UTF-8/UTF-8 BOM, detects dialect,
        and parses data rows while tracking original row numbers.
        Returns (headers, parsed_rows, errors).
        """
        errors: List[str] = []

        if len(file_bytes) > MAX_FILE_SIZE_BYTES:
            errors.append(f"File size ({len(file_bytes)} bytes) exceeds maximum limit of 5 MB.")
            return [], [], errors

        if not file_bytes.strip():
            errors.append("Uploaded file is empty.")
            return [], [], errors

        # Attempt UTF-8 with BOM support first, then fallback to Latin-1
        try:
            text = file_bytes.decode("utf-8-sig")
        except UnicodeDecodeError:
            try:
                text = file_bytes.decode("latin-1")
            except Exception as e:
                errors.append(f"Unable to decode CSV file. Expected UTF-8 encoding. Error: {str(e)}")
                return [], [], errors

        stream = io.StringIO(text, newline=None)

        # Sniff delimiter (default to comma)
        sample = text[:4096]
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
        except Exception:
            dialect = csv.excel

        stream.seek(0)
        reader = csv.reader(stream, dialect)

        try:
            raw_header_row = next(reader)
        except StopIteration:
            errors.append("CSV file contains no rows.")
            return [], [], errors
        except Exception as e:
            errors.append(f"Malformed CSV header structure: {str(e)}")
            return [], [], errors

        headers = [h.strip() for h in raw_header_row]
        if not any(headers):
            errors.append("CSV file header row is blank or invalid.")
            return [], [], errors

        expected_cols = len(headers)
        parsed_rows: List[Dict[str, Any]] = []

        row_index = 1  # Header was row 1
        for row in reader:
            row_index += 1

            # Skip empty lines
            if not row or all(c.strip() == "" for c in row):
                continue

            if len(parsed_rows) >= MAX_ROW_COUNT:
                errors.append(f"CSV exceeds maximum supported limit of {MAX_ROW_COUNT} rows.")
                break

            # Check column count consistency
            is_malformed = len(row) != expected_cols

            row_data: Dict[str, str] = {}
            for i, h in enumerate(headers):
                val = row[i] if i < len(row) else ""
                row_data[h] = val

            parsed_rows.append({
                "row_number": row_index,
                "data": row_data,
                "is_malformed": is_malformed,
                "raw_values": row,
            })

        return headers, parsed_rows, errors

    @classmethod
    def clean_and_validate_rows(
        cls,
        parsed_rows: List[Dict[str, Any]],
        column_mapping: Dict[str, str],
        existing_db_emails: Set[str],
    ) -> List[EmployeeImportPreviewRow]:
        """
        Executes strict deterministic validation rules across all parsed rows.
        Guarantees:
        - Original row number preservation.
        - Leading/trailing whitespace trimming.
        - Lowercase email normalization.
        - In-file duplicate detection.
        - MongoDB existing email check.
        - Role normalization with privilege assignment flagging.
        """
        preview_rows: List[EmployeeImportPreviewRow] = []
        seen_file_emails: Dict[str, int] = {}  # email -> first seen row_number

        name_col = column_mapping.get("name")
        email_col = column_mapping.get("email")
        role_col = column_mapping.get("role")
        position_col = column_mapping.get("position")
        dept_col = column_mapping.get("department")

        for item in parsed_rows:
            row_num = item["row_number"]
            data = item["data"]
            row_errors: List[str] = []
            row_warnings: List[str] = []

            if item.get("is_malformed"):
                row_errors.append("Row column count does not match CSV header count.")

            # 1. Clean Name
            raw_name = data.get(name_col, "") if name_col else ""
            cleaned_name = raw_name.strip()
            if not cleaned_name:
                row_errors.append("Full name is required.")
            elif len(cleaned_name) > 255:
                row_errors.append("Full name exceeds maximum length of 255 characters.")

            # 2. Clean Email
            raw_email = data.get(email_col, "") if email_col else ""
            cleaned_email = raw_email.strip().lower()
            if not cleaned_email:
                row_errors.append("Email address is required.")
            elif not EMAIL_REGEX.match(cleaned_email):
                row_errors.append(f"Invalid email format: '{cleaned_email}'.")
            else:
                # Check duplicate in file
                if cleaned_email in seen_file_emails:
                    prior_row = seen_file_emails[cleaned_email]
                    row_errors.append(f"Duplicate email in file; already present on row {prior_row}.")
                else:
                    seen_file_emails[cleaned_email] = row_num

                # Check duplicate in MongoDB
                if cleaned_email in existing_db_emails:
                    row_errors.append("Email is already registered to an existing account in MongoDB.")

            # 3. Clean Role
            raw_role = data.get(role_col, "") if role_col else ""
            cleaned_role_str = raw_role.strip().lower()
            normalized_role = UserRole.EMPLOYEE

            if cleaned_role_str:
                if cleaned_role_str in ROLE_SYNONYMS:
                    normalized_role = ROLE_SYNONYMS[cleaned_role_str]
                    if normalized_role == UserRole.ADMIN:
                        row_warnings.append("Privileged ADMIN role requested; will be provisioned with full system access.")
                    elif normalized_role == UserRole.TEAM_LEAD:
                        row_warnings.append("TEAM_LEAD role requested; requires department affiliation for task scoping.")
                else:
                    row_errors.append(f"Invalid role '{raw_role.strip()}'. Permitted roles: EMPLOYEE, TEAM_LEAD, ADMIN.")
            else:
                normalized_role = UserRole.EMPLOYEE

            # 4. Clean Position
            raw_pos = data.get(position_col, "") if position_col else ""
            cleaned_pos = raw_pos.strip() if raw_pos else None
            if cleaned_pos and len(cleaned_pos) > 100:
                row_errors.append("Position exceeds maximum length of 100 characters.")

            # 5. Clean Department
            raw_dept = data.get(dept_col, "") if dept_col else ""
            cleaned_dept = raw_dept.strip() if raw_dept else None
            if cleaned_dept and len(cleaned_dept) > 100:
                row_errors.append("Department exceeds maximum length of 100 characters.")

            # Determine status classification
            is_valid = len(row_errors) == 0
            if any("already present on row" in err for err in row_errors):
                row_status = "DUPLICATE_IN_FILE"
            elif any("already registered" in err for err in row_errors):
                row_status = "EXISTING_IN_DB"
            elif not is_valid:
                row_status = "ERROR"
            else:
                row_status = "VALID"

            preview_rows.append(
                EmployeeImportPreviewRow(
                    row_number=row_num,
                    name=cleaned_name,
                    email=cleaned_email,
                    role=normalized_role.value,
                    position=cleaned_pos,
                    department=cleaned_dept,
                    is_valid=is_valid,
                    status=row_status,
                    errors=row_errors,
                    warnings=row_warnings,
                    original_data=data,
                )
            )

        return preview_rows

    @staticmethod
    def generate_sample_csv() -> str:
        """Returns standard sample CSV template with diverse alias headers and valid rows."""
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Full Name", "Work Email", "Employee Role", "Department", "Job Position"])
        writer.writerow(["Sarah Jenkins", "sarah.jenkins@company.com", "EMPLOYEE", "Engineering", "Senior Frontend Engineer"])
        writer.writerow(["Michael Chen", "michael.chen@company.com", "TEAM_LEAD", "Engineering", "Engineering Lead"])
        writer.writerow(["Emily Rodriguez", "emily.rodriguez@company.com", "EMPLOYEE", "Product", "Product Manager"])
        writer.writerow(["David Kim", "david.kim@company.com", "EMPLOYEE", "Design", "UI/UX Designer"])
        writer.writerow(["Jessica Taylor", "jessica.taylor@company.com", "EMPLOYEE", "Operations", "Operations Analyst"])
        return output.getvalue()

    @staticmethod
    def generate_error_report_csv(rows: List[Dict[str, Any]]) -> str:
        """Generates a downloadable CSV containing original row numbers, fields, and error causes."""
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Row Number", "Name", "Email", "Role", "Department", "Position", "Validation Errors"])
        for r in rows:
            errors_str = " | ".join(r.get("errors", []))
            writer.writerow([
                r.get("row_number", ""),
                r.get("name", ""),
                r.get("email", ""),
                r.get("role", ""),
                r.get("department", ""),
                r.get("position", ""),
                errors_str,
            ])
        return output.getvalue()
