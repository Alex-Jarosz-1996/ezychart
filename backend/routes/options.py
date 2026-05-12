import logging

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request

from core.dependencies import get_current_user
from core.limiter import limiter
from models.options import OptionsChainResponse
from services import options_service
from services.options_service import OptionsRateLimitError

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")


@router.get("/options/{symbol}", response_model=OptionsChainResponse)
@limiter.limit("30/minute")
def get_options_chain(
    request: Request,
    symbol: str = Path(..., pattern=r"^[A-Za-z.]{1,10}$"),
    strike_price: float | None = Query(None, gt=0),
    _=Depends(get_current_user),
):
    try:
        data = options_service.get_options_chain(
            symbol.upper(), strike_price=strike_price
        )
    except OptionsRateLimitError:
        raise HTTPException(
            status_code=429, detail="Rate limit exceeded, please try again shortly"
        ) from None
    except Exception:
        logger.exception("Error fetching options for %s", symbol)
        raise HTTPException(
            status_code=502, detail="Failed to fetch options data"
        ) from None

    if not data["calls"] and not data["puts"]:
        raise HTTPException(
            status_code=404, detail=f"No options found for '{symbol.upper()}'"
        )

    return OptionsChainResponse(**data)
