"""unique household member per user, one grocery list per household

Revision ID: 7c1d2e3f4a5b
Revises: 8d2e3f4a5b6c
Create Date: 2026-10-06 00:00:00.000000

Route handlers run concurrently in FastAPI's threadpool. Without these, two
first-load requests could each create a household (or grocery list) for the
same user, splitting their pantry and shopping list across two rows.
Fails if an existing database already holds duplicates — merge those first.
"""
from typing import Sequence, Union

from alembic import op


revision: str = '7c1d2e3f4a5b'
down_revision: Union[str, Sequence[str], None] = '8d2e3f4a5b6c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index('uq_household_members_user_id', 'household_members', ['user_id'], unique=True, if_not_exists=True)
    op.create_index('uq_grocery_lists_household_id', 'grocery_lists', ['household_id'], unique=True, if_not_exists=True)


def downgrade() -> None:
    op.drop_index('uq_grocery_lists_household_id', table_name='grocery_lists', if_exists=True)
    op.drop_index('uq_household_members_user_id', table_name='household_members', if_exists=True)
