import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import col, func, select

from app.api.deps import SessionDep, get_current_user
from app.models import (
    Message,
    PrintJob,
    PrintJobPublic,
    PrintJobsPublic,
)

router = APIRouter(
    prefix="/prints",
    tags=["prints"],
    dependencies=[Depends(get_current_user)],
)


@router.get("/", response_model=PrintJobsPublic)
def read_prints(session: SessionDep, skip: int = 0, limit: int = 500) -> Any:
    """Retrieve print jobs, most recent first."""
    count = session.exec(select(func.count()).select_from(PrintJob)).one()
    statement = (
        select(PrintJob)
        .order_by(col(PrintJob.finished_at).desc())
        .offset(skip)
        .limit(limit)
    )
    jobs = session.exec(statement).all()
    return PrintJobsPublic(
        data=[PrintJobPublic.model_validate(job) for job in jobs], count=count
    )


@router.get("/active", response_model=PrintJobsPublic)
def read_active_prints(session: SessionDep) -> Any:
    """Retrieve print jobs that are currently running (status == 4)."""
    statement = select(PrintJob).where(PrintJob.status == 4)
    jobs = session.exec(statement).all()
    return PrintJobsPublic(
        data=[PrintJobPublic.model_validate(job) for job in jobs], count=len(jobs)
    )


@router.get("/stats", response_model=PrintJobPublic | None)
def read_print_stats(session: SessionDep) -> Any:
    """Return the most recently finished print job."""
    return session.exec(
        select(PrintJob).order_by(col(PrintJob.finished_at).desc())
    ).first()


@router.get("/{print_id}", response_model=PrintJobPublic)
def read_print(print_id: uuid.UUID, session: SessionDep) -> Any:
    job = session.get(PrintJob, print_id)
    if not job:
        raise HTTPException(status_code=404, detail="Print job not found")
    return job


@router.delete("/{print_id}", response_model=Message)
def delete_print(print_id: uuid.UUID, session: SessionDep) -> Any:
    job = session.get(PrintJob, print_id)
    if not job:
        raise HTTPException(status_code=404, detail="Print job not found")
    session.delete(job)
    session.commit()
    return Message(message="Print job deleted")
