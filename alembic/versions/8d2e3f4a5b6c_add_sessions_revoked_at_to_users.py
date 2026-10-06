"""add sessions_revoked_at to users

Revision ID: 8d2e3f4a5b6c
Revises: 5b2a44f85c2e
Create Date: 2026-10-06 00:00:00.000000

Logout now revokes the user's session tokens: any token issued at or before
users.sessions_revoked_at is rejected.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '8d2e3f4a5b6c'
down_revision: Union[str, Sequence[str], None] = '5b2a44f85c2e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('users') as batch_op:
        batch_op.add_column(sa.Column('sessions_revoked_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('users') as batch_op:
        batch_op.drop_column('sessions_revoked_at')
