package logo

import (
	"errors"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/badStephane/dieuliko/apps/api/internal/httpx"
)

// UploadField is the multipart part holding the image, and the field its errors are reported on.
const UploadField = "file"

// maxMultipartOverhead leaves room for the multipart boundaries and headers around the file.
const maxMultipartOverhead = 16 << 10

// ReadUpload streams a multipart body up to its UploadField part; on failure it answers and returns false.
func ReadUpload(c *gin.Context) ([]byte, bool) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, MaxBytes+maxMultipartOverhead)
	reader, err := c.Request.MultipartReader()
	if err != nil {
		httpx.Fail(c, http.StatusBadRequest, httpx.CodeBadRequest, "Envoyez le logo dans un formulaire (multipart/form-data).")
		return nil, false
	}
	for {
		part, err := reader.NextPart()
		if err != nil {
			failUpload(c, err)
			return nil, false
		}
		if part.FormName() != UploadField {
			continue // NextPart discards the unread rest of this part
		}
		content, err := ReadAll(part)
		if err == nil && len(content) > MaxBytes {
			err = &http.MaxBytesError{Limit: MaxBytes}
		}
		if err != nil {
			failUpload(c, err)
			return nil, false
		}
		return content, true
	}
}

func failUpload(c *gin.Context, err error) {
	var tooLarge *http.MaxBytesError
	message := ""
	switch {
	case errors.As(err, &tooLarge):
		message = MsgTooLarge
	case errors.Is(err, io.EOF):
		message = "Choisissez une image."
	default:
		httpx.Fail(c, http.StatusBadRequest, httpx.CodeBadRequest, "Requête invalide.")
		return
	}
	httpx.FailFields(c, http.StatusUnprocessableEntity, httpx.CodeValidation, message, map[string]string{UploadField: message})
}
