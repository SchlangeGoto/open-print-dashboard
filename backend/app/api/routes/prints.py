import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import col, func, select

from app import crud
from app.api.deps import TenantContextDep, require_permission
from app.models import (
    Message,
    PrintJob,
    PrintJobPublic,
    PrintJobsPublic,
)
from app.services.printer_service import printer_service

router = APIRouter(
    prefix="/prints",
    tags=["prints"],
    dependencies=[Depends(require_permission("prints.read"))],
)


@router.get("/", response_model=PrintJobsPublic)
def read_prints(
    context: TenantContextDep,
    skip: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=1000)] = 500,
) -> Any:
    """Retrieve print jobs, most recent first."""
    tenant_filter = PrintJob.tenant_id == context.tenant.id
    count = context.session.exec(
        select(func.count()).select_from(PrintJob).where(tenant_filter)
    ).one()
    statement = (
        select(PrintJob)
        .where(tenant_filter)
        .order_by(
            col(PrintJob.finished_at).desc().nullslast(),
            col(PrintJob.created_at).desc(),
            col(PrintJob.id).desc(),
        )
        .offset(skip)
        .limit(limit)
    )
    jobs = context.session.exec(statement).all()
    return PrintJobsPublic(
        data=[PrintJobPublic.model_validate(job) for job in jobs], count=count
    )


@router.get("/active", response_model=PrintJobsPublic)
def read_active_prints(context: TenantContextDep) -> Any:
    """Retrieve print jobs that are currently running (status == 4)."""
    statement = select(PrintJob).where(
        PrintJob.tenant_id == context.tenant.id, PrintJob.status == 4
    )
    jobs = context.session.exec(statement).all()
    return PrintJobsPublic(
        data=[PrintJobPublic.model_validate(job) for job in jobs], count=len(jobs)
    )


@router.get("/stats", response_model=PrintJobPublic | None)
def read_print_stats(context: TenantContextDep) -> Any:
    """Return the most recently finished print job."""
    return context.session.exec(
        select(PrintJob)
        .where(PrintJob.tenant_id == context.tenant.id)
        .where(col(PrintJob.finished_at).is_not(None))
        .order_by(col(PrintJob.finished_at).desc())
    ).first()


@router.get("/{print_id}", response_model=PrintJobPublic)
def read_print(print_id: uuid.UUID, context: TenantContextDep) -> Any:
    job = context.session.exec(
        select(PrintJob).where(
            PrintJob.id == print_id,
            PrintJob.tenant_id == context.tenant.id,
        )
    ).first()
    if not job:
        raise HTTPException(status_code=404, detail="Print job not found")
    return job


@router.delete(
    "/{print_id}",
    response_model=Message,
    dependencies=[Depends(require_permission("prints.delete"))],
)
def delete_print(print_id: uuid.UUID, context: TenantContextDep) -> Any:
    job = context.session.exec(
        select(PrintJob).where(
            PrintJob.id == print_id,
            PrintJob.tenant_id == context.tenant.id,
        )
    ).first()
    if not job:
        raise HTTPException(status_code=404, detail="Print job not found")
    if job.device_id and job.bambu_task_id:
        client = printer_service.get_client(context.tenant.id, job.device_id)
        if client is not None:
            # Do not recreate a deleted record when the printer repeats its
            # finish report.
            client.forget_started_task(job.bambu_task_id)
    context.session.delete(job)
    context.session.commit()
    crud.record_audit(
        session=context.session,
        tenant_id=context.tenant.id,
        user_id=context.user.id,
        action="print.delete",
        target=str(print_id),
    )
    return Message(message="Print job deleted")
