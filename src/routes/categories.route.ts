import { Router } from 'express'
import {
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory
} from '../controllers/categories.controller'

const r = Router()

r.get('/', listCategories)
r.get('/:idOrSlug', getCategory)

// protege estas con middleware de admin en prod
r.post('/', createCategory)
r.patch('/:id', updateCategory)
r.delete('/:id', deleteCategory)

export default r
