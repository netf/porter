package gorm

import (
	"context"
	"errors"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/porter-dev/porter/internal/models"
	"github.com/porter-dev/porter/internal/repository"
	"github.com/porter-dev/porter/internal/repository/gorm/helpers"
	"gorm.io/gorm"
)

// PorterAppEventRepository uses gorm.DB for querying the database
type PorterAppEventRepository struct {
	db *gorm.DB
}

// NewPorterAppEventRepository returns a PorterAppEventRepository which uses
// gorm.DB for querying the database
func NewPorterAppEventRepository(db *gorm.DB) repository.PorterAppEventRepository {
	return &PorterAppEventRepository{db}
}

func (repo *PorterAppEventRepository) ListEventsByPorterAppID(ctx context.Context, porterAppID uint, opts ...helpers.QueryOption) ([]*models.PorterAppEvent, helpers.PaginatedResult, error) {
	apps := []*models.PorterAppEvent{}
	paginatedResult := helpers.PaginatedResult{}

	id := strconv.Itoa(int(porterAppID))
	if id == "" {
		return nil, paginatedResult, errors.New("invalid porter app id supplied")
	}

	db := repo.db.Model(&models.PorterAppEvent{})
	db = db.Scopes(helpers.Paginate(db, &paginatedResult, opts...))

	if err := db.Where("porter_app_id = ?", id).Order("created_at DESC").Find(&apps).Error; err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, paginatedResult, err
		}
	}

	return apps, paginatedResult, nil
}

func (repo *PorterAppEventRepository) CreateEvent(ctx context.Context, appEvent *models.PorterAppEvent) error {
	if appEvent.ID == uuid.Nil {
		appEvent.ID = uuid.New()
	}
	if appEvent.CreatedAt.IsZero() {
		appEvent.CreatedAt = time.Now().UTC()
	}
	if appEvent.UpdatedAt.IsZero() {
		appEvent.UpdatedAt = time.Now().UTC()
	}
	if appEvent.PorterAppID == 0 {
		return errors.New("invalid porter app id supplied")
	}

	if err := repo.db.Create(appEvent).Error; err != nil {
		return err
	}
	return nil
}

func (repo *PorterAppEventRepository) UpdateEvent(ctx context.Context, appEvent *models.PorterAppEvent) error {
	if appEvent.ID == uuid.Nil {
		appEvent.ID = uuid.New()
	}
	if appEvent.UpdatedAt.IsZero() {
		appEvent.UpdatedAt = time.Now().UTC()
	}
	if appEvent.PorterAppID == 0 {
		return errors.New("invalid porter app id supplied")
	}
	if appEvent.Status == "" {
		return errors.New("invalid status supplied")
	}

	if err := repo.db.Model(appEvent).Updates(models.PorterAppEvent{Status: appEvent.Status}).Error; err != nil {
		return err
	}
	return nil
}

func (repo *PorterAppEventRepository) ReadEvent(ctx context.Context, id uuid.UUID) (models.PorterAppEvent, error) {
	appEvent := models.PorterAppEvent{}

	if id == uuid.Nil {
		return appEvent, errors.New("invalid porter app event id supplied")
	}

	strID := id.String()

	if err := repo.db.Where("id = ?", strID).First(&appEvent).Error; err != nil {
		return appEvent, err
	}

	return appEvent, nil
}