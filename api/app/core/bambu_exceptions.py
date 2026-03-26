class CloudflareError(Exception):
    def __init__(self):
        super().__init__("Blocked by Cloudflare")

class CodeRequiredError(Exception):
    def __init__(self):
        super().__init__("Verification code required")

class CodeExpiredError(Exception):
    def __init__(self):
        super().__init__("Verification code expired")

class CodeIncorrectError(Exception):
    def __init__(self):
        super().__init__("Verification code incorrect")

class NotLoggedInError(Exception):
    def __init__(self):
        super().__init__("No token available — login first")