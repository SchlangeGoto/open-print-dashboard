from fastapi import APIRouter

from app.api.routes import (
    bambu,
    filaments,
    login,
    printers,
    prints,
    setup,
    spools,
    users,
    utils,
)
from app.api.routes import settings as settings_routes

api_router = APIRouter()
api_router.include_router(login.router)
api_router.include_router(users.router)
api_router.include_router(utils.router)
api_router.include_router(setup.router)
api_router.include_router(bambu.router)
api_router.include_router(printers.router)
api_router.include_router(prints.router)
api_router.include_router(filaments.router)
api_router.include_router(spools.router)
api_router.include_router(settings_routes.router)
