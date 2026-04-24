from pydantic import BaseModel


class LoginStartRequest(BaseModel):
    email: str
    password: str


class LoginVerifyRequest(BaseModel):
    code: str
